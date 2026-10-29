"use server";
import { safe } from "@/lib/safeAction";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { req, str } from "@/lib/form";
import { linkMember } from "@/lib/artists";

const fields = (fd: FormData) => ({
  name: req(fd, "name", "Name"),
  kind: str(fd, "kind") ?? "Artist",
  genre: str(fd, "genre"),
  website: str(fd, "website"),
  notes: str(fd, "notes"),
});

async function createArtist(fd: FormData) {
  const user = await requireUser();
  const a = await db.artist.create({ data: { studioId: user.studioId, ...fields(fd) } });
  const contactId = str(fd, "contactId");
  if (contactId && (await db.contact.findFirst({ where: { id: contactId, studioId: user.studioId } }))) await linkMember(db, a.id, contactId);
  redirect(`/artists/${a.id}`);
}

async function updateArtist(fd: FormData) {
  const user = await requireUser();
  const id = req(fd, "id");
  await db.artist.updateMany({ where: { id, studioId: user.studioId }, data: fields(fd) });
  revalidatePath(`/artists/${id}`);
}

async function addMember(fd: FormData) {
  const user = await requireUser();
  const artistId = req(fd, "artistId");
  const contactId = req(fd, "contactId", "Contact");
  const [artist, contact] = await Promise.all([
    db.artist.findFirst({ where: { id: artistId, studioId: user.studioId } }),
    db.contact.findFirst({ where: { id: contactId, studioId: user.studioId } }),
  ]);
  if (!artist || !contact) return;
  await db.artistMember.upsert({
    where: { artistId_contactId: { artistId, contactId } },
    create: { artistId, contactId, role: str(fd, "role") },
    update: { role: str(fd, "role") },
  });
  revalidatePath(`/artists/${artistId}`);
}

async function removeMember(fd: FormData) {
  const user = await requireUser();
  const artistId = req(fd, "artistId");
  if (!(await db.artist.findFirst({ where: { id: artistId, studioId: user.studioId } }))) return;
  const contactId = req(fd, "contactId");
  await db.artistMember.deleteMany({ where: { artistId, contactId } });
  revalidatePath(`/artists/${artistId}`);
}

async function deleteArtist(fd: FormData) {
  const user = await requireUser();
  await db.artist.deleteMany({ where: { id: req(fd, "id"), studioId: user.studioId } });
  redirect("/artists");
}

// Thrown errors show as a message on the page instead of a crash screen.
const createArtistAction = safe(createArtist);
const updateArtistAction = safe(updateArtist);
const addMemberAction = safe(addMember);
const removeMemberAction = safe(removeMember);
const deleteArtistAction = safe(deleteArtist);
export { createArtistAction as createArtist, updateArtistAction as updateArtist, addMemberAction as addMember, removeMemberAction as removeMember, deleteArtistAction as deleteArtist };
