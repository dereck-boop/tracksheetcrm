"use server";
import { safe } from "@/lib/safeAction";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { req, str } from "@/lib/form";
import { fullName } from "@/lib/format";
import { findOrCreateArtist, linkMember } from "@/lib/artists";
import { mergeContacts } from "@/lib/mergeContacts";
import { planContactImport } from "@/lib/contactImport";
import { sendTemplate } from "@/lib/email";
import { emailFlash } from "@/lib/flash";
import { clientPageUrl } from "@/lib/clientPage";

function fields(fd: FormData) {
  return {
    firstName: req(fd, "firstName", "First name"),
    lastName: str(fd, "lastName"),
    email: str(fd, "email")?.toLowerCase() ?? null,
    phone: str(fd, "phone"),
    role: str(fd, "role"),
    notes: str(fd, "notes"),
    tags: (str(fd, "tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    source: str(fd, "source"),
  };
}

async function createContact(fd: FormData) {
  const user = await requireUser();
  const c = await db.contact.create({ data: { studioId: user.studioId, ...fields(fd) } });
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "contact", entityId: c.id, action: "created", summary: `Added contact ${c.firstName}` });
  redirect(`/contacts/${c.id}`);
}

async function updateContact(fd: FormData) {
  const user = await requireUser();
  const id = req(fd, "id");
  await db.contact.updateMany({ where: { id, studioId: user.studioId }, data: fields(fd) });
  revalidatePath(`/contacts/${id}`);
}

async function deleteContact(fd: FormData) {
  const user = await requireUser();
  await db.contact.deleteMany({ where: { id: req(fd, "id"), studioId: user.studioId } });
  redirect("/contacts");
}

/** Adds this person to a band/artist, typed by name (created in Artists if new). */
async function addContactToArtist(fd: FormData) {
  const user = await requireUser();
  const contact = await db.contact.findFirst({ where: { id: req(fd, "contactId"), studioId: user.studioId } });
  if (!contact) return;
  const name = str(fd, "artistName") ?? fullName(contact);
  const artist = await findOrCreateArtist(db, user.studioId, name, str(fd, "kind") ?? "Artist");
  await linkMember(db, artist.id, contact.id, str(fd, "role"));
  revalidatePath(`/contacts/${contact.id}`);
}

async function removeContactFromArtist(fd: FormData) {
  const user = await requireUser();
  const contactId = req(fd, "contactId");
  if (!(await db.contact.findFirst({ where: { id: contactId, studioId: user.studioId } }))) return;
  await db.artistMember.deleteMany({ where: { contactId, artistId: req(fd, "artistId") } });
  revalidatePath(`/contacts/${contactId}`);
}

async function mergeContact(fd: FormData) {
  const user = await requireUser();
  const keepId = req(fd, "keepId");
  const { keep, dupName } = await mergeContacts(user.studioId, keepId, req(fd, "dupId", "Contact to merge"));
  await logActivity({ studioId: user.studioId, userId: user.id, entityType: "contact", entityId: keepId, action: "merged", summary: `Merged ${dupName} into ${fullName(keep)}` });
  redirect(`/contacts/${keepId}?merged=${encodeURIComponent(dupName)}`);
}

/** Imports first name, last name and email from an uploaded CSV, skipping emails already here. */
async function importContacts(fd: FormData) {
  const user = await requireUser();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a CSV file to import");
  const [existing, studio, users] = await Promise.all([
    db.contact.findMany({ where: { studioId: user.studioId, email: { not: null } }, select: { email: true } }),
    db.studio.findUnique({ where: { id: user.studioId }, select: { email: true } }),
    db.user.findMany({ where: { studioId: user.studioId }, select: { email: true } }),
  ]);
  const own = [studio?.email, ...users.map((u) => u.email)].filter(Boolean) as string[];
  const plan = planContactImport(await file.text(), existing.map((c) => c.email!), own);
  if (plan.create.length) {
    await db.contact.createMany({ data: plan.create.map((c) => ({ studioId: user.studioId, ...c })) });
    await logActivity({ studioId: user.studioId, userId: user.id, entityType: "contact", entityId: "import", action: "imported", summary: `Imported ${plan.create.length} contacts from ${file.name}` });
  }
  revalidatePath("/contacts");
  const { existing: ex, duplicate, yours, noName } = plan.skipped;
  redirect(`/contacts/import?added=${plan.create.length}&existing=${ex}&duplicate=${duplicate}&yours=${yours}&noName=${noName}`);
}

/** Emails the client their private page link (upcoming sessions, invoices, project progress). */
async function emailClientPage(fd: FormData) {
  const user = await requireUser();
  const c = await db.contact.findFirst({ where: { id: req(fd, "id"), studioId: user.studioId } });
  if (!c) throw new Error("Contact not found");
  const result = !c.email
    ? { sent: false, error: "this contact has no email address" }
    : await sendTemplate({ studioId: user.studioId, key: "client_page", to: c.email, userId: user.id, entity: { type: "contact", id: c.id }, vars: { client_name: c.firstName, client_page: await clientPageUrl(c.id) } });
  redirect(`/contacts/${c.id}${emailFlash(result, c.email)}`);
}

/** New private link for the client page; the old one stops working. */
async function resetClientPage(fd: FormData) {
  const user = await requireUser();
  await db.contact.updateMany({ where: { id: req(fd, "id"), studioId: user.studioId }, data: { portalToken: null } });
  revalidatePath(`/contacts/${req(fd, "id")}`);
}

// Thrown errors show as a message on the page instead of a crash screen.
const createContactAction = safe(createContact);
const updateContactAction = safe(updateContact);
const deleteContactAction = safe(deleteContact);
const addContactToArtistAction = safe(addContactToArtist);
const removeContactFromArtistAction = safe(removeContactFromArtist);
const mergeContactAction = safe(mergeContact);
const importContactsAction = safe(importContacts);
const emailClientPageAction = safe(emailClientPage);
const resetClientPageAction = safe(resetClientPage);
export { createContactAction as createContact, updateContactAction as updateContact, deleteContactAction as deleteContact, addContactToArtistAction as addContactToArtist, removeContactFromArtistAction as removeContactFromArtist, mergeContactAction as mergeContact, importContactsAction as importContacts, emailClientPageAction as emailClientPage, resetClientPageAction as resetClientPage };
