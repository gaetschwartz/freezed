import * as vscode from 'vscode';
import { BuildRunnerWatch } from './watch';
import p = require('path');
import fs = require('fs');
import cp = require('child_process');

export function activate(context: vscode.ExtensionContext) {

	const watch = new BuildRunnerWatch(context);
	watch.show();

	let watch_build_runner = vscode.commands.registerCommand("freezed.build_runner_watch", async () => await watch.toggle());

	let activateBuilder = vscode.commands.registerCommand('freezed.build_runner_build', async () =>
		await build_runner_build({ useFilters: false })
	);

	let activateFastBuilder = vscode.commands.registerCommand('freezed.build_runner_build_filters', async () =>
		await build_runner_build({ useFilters: true })
	);

	let disposable = vscode.commands.registerCommand('freezed.generate', () => generateClass(undefined));
	let generateFromContextDisposable = vscode.commands.registerCommand('freezed.generate_from_context', (inUri: vscode.Uri) => generateClass(inUri));

	context.subscriptions.push(watch_build_runner, generateFromContextDisposable, disposable, activateBuilder, activateFastBuilder);
}

interface BooleanQuickPickItem extends vscode.QuickPickItem { value: boolean }

interface build_runner_options { useFilters: boolean }
async function build_runner_build({ useFilters }: build_runner_options) {
	const config = vscode.workspace.getConfiguration('freezed');
	const opts: vscode.ProgressOptions = { location: vscode.ProgressLocation.Notification };

	const filters = useFilters ? getFilters() : null;

	await vscode.window.withProgress(opts, async (p, _token) => {
		p.report({ message: "Initializing ..." });
		await new Promise<void>(async (r) => {
			const cwd = getDartProjectPath();
			console.log(`cwd=${cwd}`);
			const cmd = 'dart';
			let args: string[] = ["run", "build_runner", "build"];

			if (config.get("useDeleteConflictingOutputs.build") === true) { args.push("--delete-conflicting-outputs"); }
			if (filters !== null) { args.push(...filters.map((f) => `--build-filter="${f}"`)); }

			console.log(cmd + " " + args.join(" "));

			const child = cp.spawn(
				computeCommandName(cmd),
				args,
				{ cwd: cwd });
			let mergedErr = "";
			let lastOut: string;

			child.stdout.on('data', (data) => {
				console.log('stdout: ' + data.toString());
				p.report({ message: data.toString() });
				lastOut = data.toString();
			});

			child.stderr.on('data', (data) => {
				console.log('stderr: ' + data.toString());
				mergedErr += data;
			});

			child.on('close', (code) => {
				console.log("close: " + code);
				r(undefined);
				if (code !== 0) { vscode.window.showErrorMessage("Failed: " + mergedErr, "Close"); } else { vscode.window.showInformationMessage(lastOut); }
			});

		});

	});
}

export function getFilters(): Array<string> | null {
	// The code you place here will be executed every time your command is executed
	const uri = vscode.window.activeTextEditor?.document.uri;
	const path = uri?.path;

	/// Guard against welcome screen
	const isWelcomeScreen = path === undefined;
	if (isWelcomeScreen) { return null; }

	/// Guard against untitled files
	const isUntitled = vscode.window.activeTextEditor?.document.isUntitled;
	if (isUntitled) { return []; }

	/// Guard against no workspace name
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri!);
	const workspaceName = workspaceFolder?.name;
	if (workspaceName === undefined) { return []; }

	console.log(workspaceName);

	/// Guard against no workspace path
	const workspacePath = workspaceFolder?.uri.path;
	if (workspacePath === undefined) { return []; }

	const relativePath = path!.replace(workspacePath!, "");
	const segments = relativePath!.split("/").filter((e) => e !== "");

	/// Guard against no top level folder
	const hasTopLevelFolder = segments.length > 1;
	if (!hasTopLevelFolder) { return []; }

	//	const topLevelProjectFolder = segments![0];
	//	const topLevelFolder = `${workspacePath}/${topLevelProjectFolder}`;
	const segmentsWithoutFilename = [...segments].slice(
		0,
		segments!.length - 1
	);
	const bottomLevelFolder = `${workspacePath}/${segmentsWithoutFilename.join(
		"/"
	)}`;
	const targetFile = path;

	/// Guard against common generated files
	const targetIsFreezed = targetFile?.endsWith(".freezed.dart");
	const targetIsGenerated = targetFile?.endsWith(".g.dart");
	if (targetIsFreezed || targetIsGenerated) { return [`${bottomLevelFolder}/**`]; }

	/// get parts
	const text = vscode.window.activeTextEditor?.document.getText();
	const parts = text
		?.match(/^part ['"].*['"];$/gm)
		?.map((e) => e.replace(/^part ['"]/, "").replace(/['"]];$/, ""));

	const hasParts = !(
		parts === undefined ||
		parts === null ||
		parts?.length === 0
	);

	if (!hasParts) { return [`${bottomLevelFolder}/**`]; }

	const buildFilters = parts!.map((e) => `${bottomLevelFolder}/${e}`);

	return [...buildFilters];
}

export function getDartProjectPath(): string | undefined {
	// The code you place here will be executed every time your command is executed
	const document = vscode.window.activeTextEditor?.document;
	const uri = document?.uri;
	const path = uri?.path;

	console.log('document_path=' + path);

	/// Guard against welcome screen
	const isWelcomeScreen = path === undefined;
	if (isWelcomeScreen) { return undefined; }

	/// Guard against untitled files
	const isUntitled = document?.isUntitled;
	if (isUntitled) { return undefined; }

	/// Guard against no workspace name
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri!);
	const workspaceName = workspaceFolder?.name;
	if (workspaceName === undefined) { return undefined; }

	console.log(`workspaceName=${workspaceName}`);

	/// Guard against no workspace path
	const workspacePath = workspaceFolder?.uri.path;
	if (workspacePath === undefined) { return undefined; }

	console.log(`workspacePath=${workspacePath}`);

	const relativePath = path!.replace(workspacePath!, "");
	const segments = relativePath!.split("/").filter((e) => e !== "");
	segments.pop();

	console.log(`segments=${segments}`);

	/// Guard against no top level folder
	const hasTopLevelFolder = segments.length > 1;
	if (!hasTopLevelFolder) { return undefined; }

	const pubspecSuffix = 'pubspec.yaml';

	if (fs.existsSync(workspacePath! + pubspecSuffix)) { return workspacePath; }

	const walkSegments: string[] = [];
	for (let i = 0; i < segments.length; i++) {
		const s = segments[i];
		walkSegments.push(s);
		const projectPath = vscode.Uri.file(p.join(workspacePath, ...walkSegments)).fsPath;
		const pubspec = p.join(projectPath, pubspecSuffix);
		console.log('Looking for ' + pubspec);
		if (fs.existsSync(pubspec)) { console.log('Found it!'); return projectPath; }
	}
	return undefined;
}


export let isWin32 = process.platform === "win32";
export let computeCommandName = (cmd: string): string => isWin32 ? cmd + ".bat" : cmd;

async function generateClass(inUri: vscode.Uri | undefined) {
	// The code you place here will be executed every time your command is executed

	// Display a message box to the user
	const nameOpts: vscode.InputBoxOptions = {
		prompt: "Choose a name for your class",
		validateInput: async (value) => {
			return /^[0-9a-zA-Z_]+$/g.test(value) ? null : "It is not a valid class name !";
		}

	};
	const name = await vscode.window.showInputBox(nameOpts);
	if (name === undefined) {
		vscode.window.showErrorMessage("Aborted");
		return;
	}

	const doJson: readonly BooleanQuickPickItem[] = await new Promise((res) => {
		const quickpick = vscode.window.createQuickPick<BooleanQuickPickItem>();
		const items = [{ label: "Yes", value: true }, { label: "No", value: false }];
		quickpick.title = "Add toJSON/fromJSON methods ?";
		quickpick.items = items;
		quickpick.onDidAccept(() => quickpick.hide());
		quickpick.onDidHide(() => { res(quickpick.selectedItems); quickpick.dispose(); });
		quickpick.show();
	});

	if (doJson === undefined || doJson.length === 0) {
		vscode.window.showErrorMessage("Aborted");
		return;
	}
	const openOpts: vscode.OpenDialogOptions = { canSelectMany: false, canSelectFiles: false, canSelectFolders: true };

	var uri: vscode.Uri;

	if (inUri === undefined) {
		const userUri = await vscode.window.showOpenDialog(openOpts);
		if (userUri === undefined) {
			vscode.window.showErrorMessage("Aborted");
			return;
		}
		uri = userUri[0];
	} else {
		uri = inUri;
	}

	var filePath = p.join(uri.fsPath, name.toLowerCase() + '.dart');
	fs.writeFileSync(filePath, generateFile(name, doJson[0].value), 'utf8');

	var openPath = vscode.Uri.parse("file:///" + filePath); //A request file path
	vscode.workspace.openTextDocument(openPath).then(doc => {
		vscode.window.showTextDocument(doc);
		vscode.window.showInformationMessage("Successfully generated " + camelize(name) + " class.", "Okay");
	});
}



function generateFile(name: String, doJson: boolean) {
	const lower = name.toLowerCase();
	const camel = camelize(name);
	const jsonImport = doJson ? `part '${lower}.g.dart';` : "";
	const jsonConstr = doJson ? `
  factory ${camel}.fromJson(Map<String, dynamic> json) =>
			_$${camel}FromJson(json);` : "";

	const content = `
import 'package:freezed_annotation/freezed_annotation.dart';

part '${lower}.freezed.dart';
${jsonImport}

@freezed
abstract class ${camel} with _$${camel} {
  factory ${camel}() = _${camel};
	${jsonConstr}
}
`;
	return content;
}

export function camelize(str: String) {
	return str.replace(/^([a-z])|((?:[\s_])[a-z])/g, function (match, _index) {
		if (+match === 0) { return ""; } // or if (/\s+/.test(match)) for white spaces
		return match.toUpperCase().replace(/[\s_]/g, (_, __) => "");
	});
}

export function deactivate() { }
