import { STARTER_MJML } from "../starter.js";
import type { EmailTemplate } from "../templates.js";

const NEWSLETTER = `<mjml>
  <mj-body background-color="#f4f4f5">
    <mj-section background-color="#ffffff" padding="32px 24px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold">Monthly update</mj-text>
        <mj-text color="#555555">A short note, a useful link and one clear call to action.</mj-text>
        <mj-button background-color="#6d28d9" color="#ffffff" href="https://example.com">Read more</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

const WELCOME = `<mjml>
  <mj-body background-color="#f4f4f5">
    <mj-section background-color="#ffffff" padding="32px 24px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold">Welcome aboard</mj-text>
        <mj-text color="#555555">Your account is ready. Here are the first three things to try.</mj-text>
        <mj-button background-color="#111827" color="#ffffff" href="https://example.com">Open the app</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

export const EXAMPLE_TEMPLATES = [
  {
    id: "blank",
    name: "Blank email",
    category: "Starter",
    blurb: "One section and a prompt.",
    featured: false,
    mjml: STARTER_MJML,
  },
  {
    id: "newsletter",
    name: "Newsletter",
    category: "Recurring",
    blurb: "A simple update with one call to action.",
    featured: true,
    mjml: NEWSLETTER,
  },
  {
    id: "welcome",
    name: "Welcome email",
    category: "Onboarding",
    blurb: "A starter onboarding message.",
    featured: true,
    mjml: WELCOME,
  },
] as const satisfies readonly EmailTemplate[];
