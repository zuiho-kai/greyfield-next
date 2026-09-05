interface ModelDriver {
  loadModel(path: string): Promise<void>;
  destroy(): void;
}

/** One renderer per mounted stage; model loads must not mutate it concurrently. */
export function createLive2DStageLoader<Driver extends ModelDriver>(createDriver: () => Promise<Driver>) {
  let initialization: Promise<Driver> | undefined;
  let pending: Promise<void> = Promise.resolve();
  let revision = 0;
  let disposed = false;

  return {
    load(path: string | null): Promise<Driver | null> {
      const requestedRevision = ++revision;
      const isCurrent = () => !disposed && requestedRevision === revision;
      const result = pending.then(async () => {
        if (!path || !isCurrent()) return null;
        try {
          initialization ??= createDriver().catch((error: unknown) => {
            initialization = undefined;
            throw error;
          });
          const driver = await initialization;
          if (!isCurrent()) return null;
          await driver.loadModel(path);
          return isCurrent() ? driver : null;
        } catch (error) {
          if (!isCurrent()) return null;
          throw error;
        }
      });
      pending = result.then(() => undefined, () => undefined);
      return result;
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      revision++;
      // Pixi's pending model load cannot be aborted; destroy after it settles,
      // so its completion cannot attach a model to an already destroyed app.
      await pending;
      const driver = await initialization;
      driver?.destroy();
    }
  };
}
