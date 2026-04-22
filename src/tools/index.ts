import type { ToolRegistrar } from "./common.js";
import { registerAppendToNoteTool } from "./appendToNote.js";
import { registerDeletePathTool } from "./deletePath.js";
import { registerGetActiveFileTool } from "./getActiveFile.js";
import { registerListFilesTool } from "./listFiles.js";
import { registerMovePathTool } from "./movePath.js";
import { registerOpenFileTool } from "./openFile.js";
import { registerPatchFrontmatterTool } from "./patchFrontmatter.js";
import { registerPatchHeadingTool } from "./patchHeading.js";
import { registerReadNoteTool } from "./readNote.js";
import { registerReadNoteMetadataTool } from "./readNoteMetadata.js";
import { registerRenamePathTool } from "./renamePath.js";
import { registerSearchContentAdvancedTool } from "./searchContentAdvanced.js";
import { registerSearchTool } from "./search.js";
import { registerStatPathTool } from "./statPath.js";
import { registerTreeTool } from "./tree.js";
import { registerWriteNoteTool } from "./writeNote.js";

export const toolRegistrars: ToolRegistrar[] = [
  registerListFilesTool,
  registerReadNoteTool,
  registerReadNoteMetadataTool,
  registerWriteNoteTool,
  registerAppendToNoteTool,
  registerPatchHeadingTool,
  registerPatchFrontmatterTool,
  registerSearchTool,
  registerSearchContentAdvancedTool,
  registerGetActiveFileTool,
  registerOpenFileTool,
  registerMovePathTool,
  registerRenamePathTool,
  registerDeletePathTool,
  registerStatPathTool,
  registerTreeTool,
];
