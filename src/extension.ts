// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import path = require('path');
import fs = require('fs');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "freezed" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('freezed.generate', async () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		const nameOpts: vscode.InputBoxOptions = { prompt: "Choose a name for your class" };
		const name = await vscode.window.showInputBox(nameOpts);
		if (name === undefined) {
			vscode.window.showErrorMessage("Aborted");
			return;
		}
		const doJsonOpts: vscode.InputBoxOptions = {
			prompt: "Do you want " + name + " to be serializable ? (y/n)",
			validateInput: async (value) => {
				return value.toLowerCase() === "y" || value.toLowerCase() === "n" ? null : "Enter 'y' or 'n'";
			}
		};
		const doJson = await vscode.window.showInputBox(doJsonOpts);
		if (doJson === undefined) {
			vscode.window.showErrorMessage("Aborted");
			return;
		}
		vscode.window.showInformationMessage('Creating a class called ' + name);
		const openOpts: vscode.OpenDialogOptions = { canSelectMany: false, canSelectFiles: false, canSelectFolders: true };
		const uri = await vscode.window.showOpenDialog(openOpts);
		if (uri === undefined) {
			vscode.window.showErrorMessage("Aborted");
			return;
		}
		console.log(uri);
		var filePath = path.join(uri[0].fsPath, name.toLowerCase() + '.dart');
		fs.writeFileSync(filePath, generateFile(name, doJson), 'utf8');

		var openPath = vscode.Uri.parse("file:///" + filePath); //A request file path
		vscode.workspace.openTextDocument(openPath).then(doc => {
			vscode.window.showTextDocument(doc);
		});



	});

	context.subscriptions.push(disposable);
}

function generateFile(name: String, doJson: String) {
	const json = doJson.toLowerCase() === "y";
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
	return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match, _index) {
		if (+match === 0) { return ""; } // or if (/\s+/.test(match)) for white spaces
		return match.toUpperCase();
	});
}





// this method is called when your extension is deactivated
export function deactivate() { }
