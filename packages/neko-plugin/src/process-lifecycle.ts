import { spawn, type ChildProcess } from "node:child_process";

export function terminateChild(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      killer.on("exit", () => resolve()); killer.on("error", () => resolve());
    });
  }
  return new Promise((resolve, reject) => {
    let escalation: ReturnType<typeof setTimeout>;
    let deadline: ReturnType<typeof setTimeout>;
    const finish = (error?: Error) => {
      clearTimeout(escalation); clearTimeout(deadline);
      child.off("exit", exited); child.off("close", exited); child.off("error", finish);
      error ? reject(error) : resolve();
    };
    const exited = () => finish();
    child.once("exit", exited); child.once("close", exited); child.once("error", finish);
    escalation = setTimeout(() => {
      deadline = setTimeout(() => finish(new Error("N.E.K.O process did not exit after SIGKILL.")), 2_000);
      try { child.kill("SIGKILL"); } catch (error) { finish(error as Error); }
    }, 5_000);
    try { child.kill("SIGTERM"); } catch (error) { finish(error as Error); }
  });
}
