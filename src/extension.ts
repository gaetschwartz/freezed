// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import path = require('path');
import fs = require('fs');
import cp = require('child_process');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated

	let activateBuilder = vscode.commands.registerCommand('freezed.activate_build_runner', async () => {
		const opts: vscode.ProgressOptions = { location: vscode.ProgressLocation.Notification };
		await vscode.window.withProgress(opts, async (p, _token) => {
			p.report({ message: "Initializing ..." });
			await new Promise(async (r) => {
				const wp = vscode.workspace.workspaceFolders;
				const child = cp.spawn((process.platform === "win32" ? "flutter.bat" : "flutter"), ["pub", "run", "build_runner", "build", "--delete-conflicting-outputs"], { cwd: wp === undefined ? undefined : wp[0].uri.fsPath });
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
					console.log("close:" + code);
					r();
					if (code !== 0) { vscode.window.showErrorMessage("Failed : `" + mergedErr + "`", "Close"); } else { vscode.window.showInformationMessage(lastOut); }
				});

			});

		});

	});

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('freezed.generate', async (inUri: vscode.Uri) => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		const nameOpts: vscode.InputBoxOptions = {
			prompt: "Choose a name for your class",
			validateInput: async (value) => {
				return /^[a-zA-Z\s_]+$/g.test(value) ? null : "It is not a valid class name !";
			}

		};
		const inName = await vscode.window.showInputBox(nameOpts);
		if (inName === undefined) {
			vscode.window.showErrorMessage("Aborted");
			return;
		}
		const name = inName.replace(" ", (_, __) => "_");
		const doJsonOpts: vscode.InputBoxOptions = {
			prompt: "Do you want " + name + " to be serializable ? (Y/n)",
			validateInput: async (value) => {
				return value.toLowerCase() === "y" || value.toLowerCase() === "n" || value.length === 0 ? null : "Enter 'y' or 'n'";
			}
		};
		const doJson = await vscode.window.showInputBox(doJsonOpts);
		if (doJson === undefined) {
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

		var filePath = path.join(uri.fsPath, name.toLowerCase() + '.dart');
		fs.writeFileSync(filePath, generateFile(name, doJson), 'utf8');

		var openPath = vscode.Uri.parse("file:///" + filePath); //A request file path
		vscode.workspace.openTextDocument(openPath).then(doc => {
			vscode.window.showTextDocument(doc);
			vscode.window.showInformationMessage("Successfully created " + camelize(name) + " Freezed class !", "Okay !");
		});

	});

	context.subscriptions.push(disposable, activateBuilder);
}



function generateFile(name: String, doJson: String) {
	const json = doJson.toLowerCase() !== "n";
	const lower = name.toLowerCase();
	const camel = camelize(name);
	const jsonImport = json ? `part '${lower}.g.dart';` : "";
	const jsonConstr = json ? `
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





// this method is called when your extension is deactivated
export function deactivate() { }
