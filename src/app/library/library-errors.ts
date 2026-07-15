export class LibraryRequestError extends Error {}

export class LibraryRootValidationError extends LibraryRequestError {}

export class LibraryNotConfiguredError extends LibraryRequestError {}
