// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Position } from 'vscode';

function splitTextByPosition(text: string, position: Position): [string, string] {
	const segs = text.split("\n");
	if (segs.length <= position.line) {
		return [text, ""];
	}
	const before = segs.slice(0, position.line).join("\n") + segs[position.line].slice(0, position.character);
	const after = text.slice(before.length);
	return [before, after];
}


interface CompletionLogprobs {
	text_offset: number[];
	token_logprobs?: number[];
	tokens: string[];
	top_logprobs: Record<string, number>;
}

interface CompletionChoice {
	text: string;
	index: number;
	logprobs?: CompletionLogprobs;
	finish_reason?: string;
}

interface CompletionUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

interface Completion {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: CompletionChoice[];
	usage: CompletionUsage;
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// // The command has been defined in the package.json file
	// // Now provide the implementation of the command with registerCommand
	// // The commandId parameter must match the command field in package.json
	// const disposable = vscode.commands.registerCommand('xinf-code-assistant.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from xinf-code-assistant!');
	// });

	// context.subscriptions.push(disposable);

	let prompt_tokens = 0;
	let completion_tokens = 0;

	let current_prompt_tokens = 0;
	let current_completion_tokens = 0;

	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
	statusBar.text = `${current_prompt_tokens}/${current_completion_tokens} | ${prompt_tokens}/${completion_tokens}`;
	statusBar.tooltip = "current prompt tokens / current completion tokens | total prompt tokens / total completion tokens";
	statusBar.show();

	const provider: vscode.InlineCompletionItemProvider = {
		async provideInlineCompletionItems(document, position, context, token) {
			const config = vscode.workspace.getConfiguration("xinf-coder");
			const autoSuggest = config.get("enableAutoSuggest") as boolean;
			if (
				context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic &&
				!autoSuggest
			) {
				return;
			}
			if (position.line < 0) {
				return;
			}

			const mode = (config.get("fillInTheMiddle.enabled") as boolean)
				? "infill"
				: "completion";
			const text = document.getText();
			let endpoint = config.get("endpoint") as string;
			endpoint = endpoint.trim();
			if (endpoint.endsWith("/")) {
				endpoint = endpoint.slice(0, -1);
			}

			let [prompt, suffix] = splitTextByPosition(text, position);

			if (mode !== "infill") {
				suffix = "";
			}

			const request = {
				mode,
				model: config.get("codeModel") as string,
				prompt,
				suffix,
				max_tokens: config.get("maxNewTokens") as number,
				temperature: config.get("temperature") as number,
				top_p: 0.95,
			};

			try {
				const body = JSON.stringify(request);
				const response = (await fetch(
					`${endpoint}/v1/code/completions`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json;charset=UTF-8",
						},
						body,
					}
				).then((res) => res.json()));

				const completion = response as Completion;

				const items = [];
				for (const choice of completion.choices) {
					items.push({
						insertText: choice.text,
						range: new vscode.Range(position, position),
					});
				}

				return {
					items,
				};
			} catch (e) {
				const err_msg = (e as Error).message;
				if (err_msg.includes("is currently loading")) {
					vscode.window.showWarningMessage(err_msg);
				} else if (err_msg !== "Canceled") {
					vscode.window.showErrorMessage(err_msg);
				}
			}
		},
	};

	const icip = vscode.languages.registerInlineCompletionItemProvider(
		{ pattern: "**" },
		provider
	);

	context.subscriptions.push(icip);
}

// This method is called when your extension is deactivated
export function deactivate() { }
