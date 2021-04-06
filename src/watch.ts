import * as vscode from 'vscode';
import { computeCommandName, getDartProjectPath, isWin32 } from './extension';
import cp = require('child_process');

enum State { initializing, watching, idle, }

interface ExitData extends Object {
  code?: number | null;
  signal?: NodeJS.Signals | null;
}

const exitDataToString = (d: ExitData) => `{code: ${d.code}, signal: ${d.signal}}`;

const timeout = <T>(prom: Promise<T>, time: number) =>
  Promise.race<T>([prom, new Promise<T>((_r, rej) => setTimeout(rej, time))]);

export class BuildRunnerWatch {

  constructor() {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    this.statusBar.command = "freezed.build_runner_watch";
    this.statusBar.tooltip = "Watch with build_runner";
    this.statusBar.text = this.text();
    this.output = vscode.window.createOutputChannel("freezed & build_runner");
  }

  state: State = State.idle;
  process: cp.ChildProcessWithoutNullStreams | undefined;

  readonly watchString = "$(eye) Watch";
  readonly loadingString = "$(loading~spin) Initializing";
  readonly removeWatchString = "$(eye-closed) Remove watch";
  readonly output: vscode.OutputChannel;
  readonly statusBar: vscode.StatusBarItem;

  show(): void {
    console.log('Show status bar');
    this.statusBar.show();
  }

  text(): string {
    switch (this.state) {
      case State.idle:
        return this.watchString;
      case State.watching:
        return this.removeWatchString;
      case State.initializing:
        return this.loadingString;
    }
  }

  setState(state: State): void {
    this.state = state;
    this.statusBar.text = this.text();
  }

  async toggle(): Promise<void> {
    switch (this.state) {
      case State.idle:
        this.output.show();
        return this.watch();
      case State.watching:
        this.output.show();
        return this.removeWatch();
      case State.initializing:
        break;
    }
  }

  async removeWatch(): Promise<void> {
    if (process !== undefined) {

      let exit: ExitData;

      try {
        exit = await timeout(new Promise<ExitData>(async (r) => {
          this.process?.on('exit', (code, sgn) => r({ signal: sgn, code: code }));
          this.killWatch();
        }), 5000);
      } catch (error) {
        console.error('Error while trying to kill and timeout for 5s: ' + error);
        exit = {};
      }

      console.log(`exited successfully with: ${exitDataToString(exit)}`);

      if (this.process?.killed) {
        this.process = undefined;
        this.output.appendLine("Stopped watching");
        this.setState(State.idle);
      }
    }
  }

  getChildPID(): string | undefined {
    if (this.process !== undefined) {
      const ppid = this.process!.pid;
      const res = cp.execSync(`ps xao pid,ppid | grep "\d* ${ppid}"`, { encoding: "utf8" });
      return res.split(' ')[0];
    }
  }

  killWatch(): void {
    if (this.process !== undefined) {
      console.log('Going to try to kill the watch...');
      console.log('PID of parent is ' + this.process.pid);
      const pid = this.getChildPID();
      console.log('PID of actual process is ' + pid);
      if (isWin32()) {
        cp.spawnSync("taskkill", ["/pid", `${pid}`, '/f', '/t']);
      } else {
        cp.spawnSync("kill", ["-SIGINT", `${pid}`]);
      }
    }
  }

  async queryProject(): Promise<vscode.Uri | undefined> {
    const choose = "Choose a folder";
    const res = await vscode.window.showInformationMessage("Failed to determine where to run the command. Please choose where to run it.", choose);
    if (res !== choose) { return undefined; }
    const uri = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
    if (uri === undefined) { return undefined; }
    return uri[0];
  }

  async watch(): Promise<void> {
    const config = vscode.workspace.getConfiguration('freezed');

    let cwd = getDartProjectPath();

    if (cwd === undefined) {
      const uri = await this.queryProject();
      if (uri === undefined) { return; } else { cwd = uri.path; }
    }

    console.log(cwd);

    const cmd = 'dart';
    let args: string[] = ["run", "build_runner", "watch"];
    if (config.get("useDeleteConflictingOutputs.watch") === true) { args.push("--delete-conflicting-outputs"); }

    console.log(cmd + " " + args.join(" "));

    this.output.clear();
    this.process = cp.spawn(
      computeCommandName(cmd),
      args,
      { cwd: cwd }
    );
    this.setState(State.initializing);

    console.log(`Started with PID: ${this.process!.pid}`);

    this.process.stdout.on('data', (data) => {
      const string = data.toString();
      //console.log('stdout: ' + string);
      if (this.state !== State.watching) { this.setState(State.watching); }
      this.output.append(string);
    });

    this.process.stderr.on('data', (data) => {
      const err = data.toString();
      console.log('stderr: ' + err);
      this.output.append(err);
    });

    this.process.on('close', (code) => {
      console.log("close: " + code);

      if (code !== 0) {
        this.output.appendLine("dart run build_runner watch exited with code " + code);
        this.output.show();
      }

      // cleanup
      this.process = undefined;
      this.setState(State.idle);
    });
  }
}