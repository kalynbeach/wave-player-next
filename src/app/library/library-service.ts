import { LibraryNotConfiguredError } from "@/app/library/library-errors";
import type {
  DirectoryGateway,
  LibraryFileScanner,
  LibraryRepository,
  ReconcileResult,
} from "@/app/library/library-ports";
import type { LibraryRoot, LibraryTrack } from "@/core/library/library";

export class LibraryService {
  readonly #directories: DirectoryGateway;
  readonly #repository: LibraryRepository;
  readonly #scanner: LibraryFileScanner;

  constructor(options: {
    directories: DirectoryGateway;
    repository: LibraryRepository;
    scanner: LibraryFileScanner;
  }) {
    this.#directories = options.directories;
    this.#repository = options.repository;
    this.#scanner = options.scanner;
  }

  getRoot(): LibraryRoot | null {
    return this.#repository.getActiveRoot();
  }

  listTracks(): LibraryTrack[] {
    return this.#repository.listTracks();
  }

  async configureRoot(path: string): Promise<LibraryRoot> {
    const canonicalPath = await this.#directories.canonicalizeDirectory(path);
    const displayName = canonicalPath.split(/[\\/]/).at(-1) || canonicalPath;
    return this.#repository.replaceActiveRoot(canonicalPath, displayName);
  }

  async scan(): Promise<ReconcileResult> {
    const root = this.#repository.getActiveRoot();

    if (!root) {
      throw new LibraryNotConfiguredError(
        "Configure a library root before scanning.",
      );
    }

    this.#repository.beginScan(root.id);

    try {
      const result = await this.#scanner.scan(root.canonicalPath);
      return this.#repository.reconcileScan(root.id, result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The library scan failed.";
      this.#repository.failScan(root.id, message);
      throw error;
    }
  }
}
