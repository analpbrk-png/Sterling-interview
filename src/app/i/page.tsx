import { InviteFlow } from "@/components/invite/invite-flow";

export const metadata = { title: "Your interview", referrer: "no-referrer" as const };

/** Student entry point. The link token is in the URL fragment (#...). No sign-in. */
export default function InvitePage() {
  return <InviteFlow />;
}
