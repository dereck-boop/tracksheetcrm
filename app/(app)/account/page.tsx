import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { openSecret, otpauthUrl } from "@/lib/totp";
import { AuthForm } from "@/components/AuthForm";
import { TwoStepForm } from "@/components/TwoStepForm";
import { Badge, Card, PageHeader } from "@/components/ui";
import { changePassword, signOutEverywhere, confirmTwoStep, newBackupCodes, startTwoStepSetup, turnOffTwoStep } from "./actions";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const user = await requireUser();
  const settingUp = !user.totpEnabledAt && user.totpSecret ? openSecret(user.totpSecret) : null;
  const qr = settingUp ? await QRCode.toDataURL(otpauthUrl(settingUp, user.email, user.studio.name), { margin: 1, width: 200 }) : null;
  return (
    <>
      <PageHeader title="Your account" subtitle={`${user.name} · ${user.email}`} />
      <div className="max-w-xl space-y-6">
        <Card title="Two-step login" actions={user.totpEnabledAt ? <Badge tone="green">on</Badge> : <Badge tone="amber">off</Badge>}>
          {user.totpEnabledAt ? (
            <div className="space-y-4 text-sm">
              <p className="text-gray-700">On since {fmtDate(user.totpEnabledAt)}. Signing in asks for the code from your authenticator app after your password. {user.recoveryCodes.length} backup code{user.recoveryCodes.length === 1 ? "" : "s"} left.</p>
              <div><div className="label">Make new backup codes (the old ones stop working)</div><TwoStepForm action={newBackupCodes} field="code" submit="Make new codes" /></div>
              <div className="border-t border-gray-100 pt-3"><div className="label">Turn it off</div><TwoStepForm action={turnOffTwoStep} field="password" submit="Turn off" danger /></div>
            </div>
          ) : settingUp ? (
            <div className="space-y-4 text-sm">
              <ol className="list-decimal space-y-1 pl-5 text-gray-700">
                <li>On your phone, open an authenticator app (Google Authenticator, 1Password, Authy or Microsoft Authenticator are all free).</li>
                <li>Add an account and scan this code.</li>
                <li>Type the 6 digits it shows.</li>
              </ol>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr && <img src={qr} alt="QR code for your authenticator app" width={200} height={200} className="rounded-md border border-gray-200" />}
              <p className="text-xs text-gray-500">Can&apos;t scan? Enter this key by hand: <span className="select-all font-mono">{settingUp.replace(/(.{4})/g, "$1 ").trim()}</span></p>
              <TwoStepForm action={confirmTwoStep} field="code" submit="Turn on" />
            </div>
          ) : (
            <form action={startTwoStepSetup} className="space-y-3 text-sm">
              <p className="text-gray-700">Your CRM holds client details and takes payments. With two-step login, someone who learns your password still can&apos;t get in without your phone. It takes two minutes.</p>
              <button className="btn-primary">Turn on two-step login</button>
            </form>
          )}
        </Card>
        <Card title="Change password">
          <AuthForm action={changePassword} submit="Update password">
            <input name="current" type="password" required placeholder="Current password" aria-label="Current password" autoComplete="current-password" className="input" />
            <input name="next" type="password" required minLength={10} placeholder="New password (10+ characters)" aria-label="New password" autoComplete="new-password" className="input" />
            <input name="confirm" type="password" required minLength={10} placeholder="Confirm new password" aria-label="Confirm new password" autoComplete="new-password" className="input" />
          </AuthForm>
        </Card>
        <Card title="Signed-in devices">
          <p className="mb-3 text-sm text-gray-600">Lost a phone, or signed in on someone else&apos;s computer? This signs you out on every device, including this one. Changing your password does the same for your other devices.</p>
          <form action={signOutEverywhere}><button className="btn-danger">Sign out everywhere</button></form>
        </Card>
      </div>
    </>
  );
}
