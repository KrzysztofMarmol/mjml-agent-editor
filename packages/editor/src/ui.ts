/**
 * The shadcn primitives the editor is built from, as their own entry point.
 *
 * Separate from the main entry because that one reaches `EmailEditor`, which imports
 * GrapesJS, which touches `window` at import time. With a single barrel, a layout file
 * importing a tooltip provider drags the whole canvas into the server bundle and the
 * build dies with "window is not defined" while prerendering an unrelated page.
 *
 * Styled entirely through the CSS custom properties in `styles.css` — override those
 * rather than forking the components.
 */

export { Badge } from "./components/ui/badge.js";
export { Button, buttonVariants } from "./components/ui/button.js";
export { Input } from "./components/ui/input.js";
export { Separator } from "./components/ui/separator.js";
export { Spinner } from "./components/ui/spinner.js";
export { Textarea } from "./components/ui/textarea.js";
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip.js";
export {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./components/ui/empty.js";

export { cn } from "./lib/utils.js";
