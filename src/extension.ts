import * as vscode from 'vscode';
import p = require('path');
import fs = require('fs');
import cp = require('child_process');

export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('freezed.generate', () => generateClass(undefined));

	let generateFromContextDisposable = vscode.commands.registerCommand('freezed.generate_from_context', (inUri: vscode.Uri) => generateClass(inUri));

	let deprecated = vscode.commands.registerCommand("freezed.build_runner", async () => {
		const getIt = "Install it";
		const id = "gaetschwartz.build-runner";
		const res = await vscode.window.showWarningMessage(`Build_runner support has moved to its own extension! You can get it by searching for '${id}' in extensions.`, getIt);
		if (res === getIt) {
			const res = cp.spawnSync(computeCommandName("code") + " --install-extension " + id);
			if (res.status !== 0) {
				vscode.env.clipboard.writeText(id);
				vscode.window.showWarningMessage("Failed to install the extension automatically, copied the extension name to the clipboard, paste it in the extension search and install it manually.");
			}
		}
	});

	context.subscriptions.push(generateFromContextDisposable, disposable, deprecated);
}

interface BooleanQuickPickItem extends vscode.QuickPickItem { value: boolean }

export let isWin32 = process.platform === "win32";
let computeCommandName = (cmd: string): string => isWin32 ? cmd + ".cmd" : cmd;

const toSnake = (value: string) => value
.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
.toLowerCase()
.replace(/^_/, '');

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

	var filePath = p.join(uri.fsPath, toSnake(name) + '.dart');
	fs.writeFileSync(filePath, generateFile(name, doJson[0].value), 'utf8');

	var openPath = vscode.Uri.parse("file:///" + filePath); //A request file path
	vscode.workspace.openTextDocument(openPath).then(doc => {
		vscode.window.showTextDocument(doc);
		vscode.window.showInformationMessage("Successfully generated " + camelize(name) + " class.", "Okay");
	});
}



function generateFile(name: string, doJson: boolean) {
	const filename = toSnake(name);
	const camel = camelize(name);
	const jsonImport = doJson ? `part '${filename}.g.dart';` : "";
	const jsonConstr = doJson ? `
  factory ${camel}.fromJson(Map<String, dynamic> json) =>
			_$${camel}FromJson(json);` : "";

	const content = `
import 'package:freezed_annotation/freezed_annotation.dart';

part '${filename}.freezed.dart';
${jsonImport}

@freezed
abstract class ${camel} with _$${camel} {
  factory ${camel}() = _${camel};
	${jsonConstr}
}
`;
	return content;
}

export function camelize(str: string) {
	return str.replace(/^([a-z])|((?:[\s_])[a-z])/g, function (match, _index) {
		if (+match === 0) { return ""; } // or if (/\s+/.test(match)) for white spaces
		return match.toUpperCase().replace(/[\s_]/g, (_, __) => "");
	});
}

export function deactivate() { }
