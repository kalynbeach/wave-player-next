import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type RuntimeConfig = {
  databasePath: string;
  libraryRootOverride: string | null;
  port: number;
};

function argumentValue(
  arguments_: readonly string[],
  name: string,
): string | null {
  const inlinePrefix = `${name}=`;
  const inline = arguments_.find((argument) =>
    argument.startsWith(inlinePrefix),
  );

  if (inline) {
    return inline.slice(inlinePrefix.length) || null;
  }

  const index = arguments_.indexOf(name);
  return index >= 0 ? (arguments_[index + 1] ?? null) : null;
}

export function resolveRuntimeConfig(
  arguments_: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): RuntimeConfig {
  const port = Number.parseInt(environment.PORT ?? "3000", 10);

  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("PORT must be an integer between 0 and 65535.");
  }

  const dataDirectory = resolve(
    environment.WAVE_PLAYER_DATA_DIR ?? join(homedir(), ".wave-player-next"),
  );

  return {
    port,
    databasePath: join(dataDirectory, "wave-player.sqlite"),
    libraryRootOverride:
      argumentValue(arguments_, "--library-root") ??
      environment.WAVE_PLAYER_LIBRARY_ROOT ??
      null,
  };
}
