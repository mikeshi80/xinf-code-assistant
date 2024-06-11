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

	let total_prompt_tokens = 0;
	let total_completion_tokens = 0;
	let total_total_tokens = 0;
	let total_duration = 0;
	let total_tokens_per_second = 0;

	let current_prompt_tokens = 0;
	let current_completion_tokens = 0;
	let current_total_tokens = 0;
	let current_tokens_per_second = 0;

	const disposable = vscode.commands.registerCommand("xinf-coder.showUsage", () => {
		vscode.window.showInformationMessage(
			vscode.l10n.t("Code Completion Usage Summary"),
			{
				modal: true,
				detail: vscode.l10n.t(`current prompt tokens: {current_prompt_tokens}
current completion tokens: {current_completion_tokens}
current total tokens: {current_total_tokens}
current tokens per second: {current_tokens_per_second}
total prompt tokens: {total_prompt_tokens}
total completion tokens: {total_completion_tokens}
total total tokens: {total_total_tokens}
total tokens per second: {total_tokens_per_second}`,
					{
						current_prompt_tokens,
						current_completion_tokens,
						current_total_tokens,
						current_tokens_per_second: current_tokens_per_second.toFixed(2),
						total_prompt_tokens,
						total_completion_tokens,
						total_total_tokens,
						total_tokens_per_second: total_tokens_per_second.toFixed(2)
					}),
			}
		);
	});
	context.subscriptions.push(disposable);


	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
	statusBar.text = `${current_prompt_tokens} | ${current_completion_tokens}`;
	statusBar.tooltip = vscode.l10n.t("current prompt tokens | current completion tokens");
	statusBar.command = "xinf-coder.showUsage";

	statusBar.show();
	context.subscriptions.push(statusBar);

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
				const start = (new Date()).getTime();
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
				const end = (new Date()).getTime();

				const duration = (end - start) / 1000;

				current_prompt_tokens = completion.usage.prompt_tokens;
				current_completion_tokens = completion.usage.completion_tokens;
				current_total_tokens = completion.usage.total_tokens;
				current_tokens_per_second = current_completion_tokens / duration;

				total_prompt_tokens += current_prompt_tokens;
				total_completion_tokens += current_completion_tokens;
				total_total_tokens += current_total_tokens;
				total_duration += duration;
				total_tokens_per_second = total_completion_tokens / total_duration;

				statusBar.text = `${current_prompt_tokens} | ${current_completion_tokens}`;

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
