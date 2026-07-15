import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

import type { DirectoryGateway } from "@/app/library/library-ports";

export class NodeDirectoryGateway implements DirectoryGateway {
  async canonicalizeDirectory(path: string): Promise<string> {
    const candidate = path.trim();

    if (!candidate || !isAbsolute(candidate)) {
      throw new Error("Library roots must be absolute directory paths.");
    }

    const canonicalPath = await realpath(candidate);
    const metadata = await stat(canonicalPath);

    if (!metadata.isDirectory()) {
      throw new Error("The library root must be a directory.");
    }

    await access(canonicalPath, constants.R_OK);
    return canonicalPath;
  }
}
