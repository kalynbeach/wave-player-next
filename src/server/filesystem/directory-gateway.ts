import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { LibraryRootValidationError } from "@/app/library/library-errors";
import type { DirectoryGateway } from "@/app/library/library-ports";

export class NodeDirectoryGateway implements DirectoryGateway {
  async canonicalizeDirectory(path: string): Promise<string> {
    const candidate = path.trim();

    if (!candidate || !isAbsolute(candidate)) {
      throw new LibraryRootValidationError(
        "Library roots must be absolute directory paths.",
      );
    }

    let canonicalPath: string;

    try {
      canonicalPath = await realpath(candidate);
    } catch {
      throw new LibraryRootValidationError(
        "The library root could not be accessed.",
      );
    }

    const metadata = await stat(canonicalPath);

    if (!metadata.isDirectory()) {
      throw new LibraryRootValidationError(
        "The library root must be a directory.",
      );
    }

    try {
      await access(canonicalPath, constants.R_OK);
    } catch {
      throw new LibraryRootValidationError(
        "The library root could not be read.",
      );
    }
    return canonicalPath;
  }
}
