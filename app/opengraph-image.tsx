import { homeBody, OG_SIZE, ogImage } from "./_og/og";

export const alt = "top9.wtf — Match nine games with a job posting.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return ogImage(homeBody(), 300);
}
