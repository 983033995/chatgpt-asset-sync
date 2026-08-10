import { slugify } from "../utils/slug.js";

export interface ProjectContext {
  project?: string;
  chatgptProject?: string;
  conversationTitle?: string;
}

export function resolveProject(context: ProjectContext): string {
  if (context.project?.trim()) return slugify(context.project);
  if (context.chatgptProject?.trim()) return slugify(context.chatgptProject);
  if (context.conversationTitle?.trim()) return slugify(context.conversationTitle);
  return "_unclassified";
}
