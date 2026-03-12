import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

type ConvertResult = {
	convertedText: string;
	convertedCount: number;
	skippedCount: number;
};

//画像表示表記を取得するための正規表現パターン
const IMAGE_REGEX = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+(".*?"|'.*?'|\(.*?\)))?\s*\)/g;

//拡張子とMimeTypeのリスト
const MIME_MAP: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.bmp': 'image/bmp',
	'.ico': 'image/x-icon',
	'.tif': 'image/tiff',
	'.tiff': 'image/tiff',
	'.avif': 'image/avif'
};

// 拡張子からMimeTypeを判定する
function getMimeType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();

	return MIME_MAP[ext] ?? 'application/octet-stream';
}

// 実ファイルを参照しているかチェックする
function isFileReference(rawPath: string): boolean {
	const trimmed = rawPath.trim();

	if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
		return true;
	}

	if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
		return false;
	}

	if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
		return false;
	}

	return true;
}

// Markdownの画像パスから実パスを取得
function extractPathForFileLookup(markdownPath: string): string {
	const unwrapped = markdownPath.trim().replace(/^<|>$/g, '');
	const withoutQueryAndHash = unwrapped.split(/[?#]/, 1)[0];

	try {
		return decodeURIComponent(withoutQueryAndHash);
	} catch {
		return withoutQueryAndHash;
	}
}

async function convertMarkdownImagesToBase64(markdownText: string, markdownFilePath: string): Promise<ConvertResult> {
	let convertedCount = 0;
	let skippedCount = 0;
	let lastIndex = 0;
	const chunks: string[] = [];

	//本文から正規表現にマッチした個所をループする
	for (const match of markdownText.matchAll(IMAGE_REGEX)) {
		//マッチ箇所全文
		const fullMatch = match[0];
		//画像のalt文字列部分
		const altText = match[1] ?? '';
		//画像のパス部分
		const imagePathRaw = match[2] ?? '';
		//画像のタイトル部分
		const titlePart = match[3] ? ` ${match[3]}` : '';
		//今回マッチした個所の、本文全体から見た位置
		const startIndex = match.index ?? 0;

		//今回マッチした個所の直前までの本文を保持する
		chunks.push(markdownText.slice(lastIndex, startIndex));
		lastIndex = startIndex + fullMatch.length;

		//画像パスを取得
		const pathForLookup = extractPathForFileLookup(imagePathRaw);
		//ローカルファイルを参照しているかチェック
		if (!isFileReference(pathForLookup)) {
			//ローカルファイルでなければそのままにする
			skippedCount += 1;
			chunks.push(fullMatch);
			continue;
		}

		//画像パスの取得
		const absoluteImagePath = path.isAbsolute(pathForLookup)
			? pathForLookup
			: path.resolve(path.dirname(markdownFilePath), pathForLookup);

		try {
			//画像のバイナリを取得
			const imageBuffer = await fs.readFile(absoluteImagePath);
			//MimeTypeの取得
			const mimeType = getMimeType(absoluteImagePath);
			//base64文字列に変換
			const base64 = imageBuffer.toString('base64');
			//base64を使用するdataURLの作成
			const dataUri = `data:${mimeType};base64,${base64}`;
			//dataURLを使用した画像要素をchunksに保持
			chunks.push(`![${altText}](${dataUri}${titlePart})`);
			convertedCount += 1;
		} catch {
			skippedCount += 1;
			chunks.push(fullMatch);
		}
	}

	//最後にマッチした個所以降の本文を保持
	chunks.push(markdownText.slice(lastIndex));

	//この時点でchunksには画像要素以外の本文と、dataURLを使用した画像要素が交互に配置される

	//chunksをゼロスペースで結合することで本文全体を作成して返す
	return {
		convertedText: chunks.join(''),
		convertedCount,
		skippedCount
	};
}

// 拡張機能がアクティブ化された際の処理
export function activate(context: vscode.ExtensionContext) {

	console.log('Extension "ImageInDocsToBase64" is now active.');

	//コマンドの追加
	const command1 = vscode.commands.registerCommand('imagesindocstobase64.convertMarkdownImages', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('アクティブなエディターが見つかりません。Markdown ファイルを開いて実行してください。');
			return;
		}

		const document = editor.document;
		if (document.languageId !== 'markdown') {
			vscode.window.showWarningMessage('このコマンドは Markdown ファイルでのみ実行できます。');
			return;
		}

		const originalText = document.getText();
		const sourcePath = document.uri.fsPath;

		const { convertedText, convertedCount, skippedCount } = await convertMarkdownImagesToBase64(originalText, sourcePath);

		const parsed = path.parse(sourcePath);
		const outputPath = path.join(parsed.dir, `${parsed.name}_converted${parsed.ext || '.md'}`);

		await fs.writeFile(outputPath, convertedText, 'utf8');

		vscode.window.showInformationMessage(
			`変換完了: ${convertedCount} 件を Base64 化、${skippedCount} 件をスキップしました。保存先: ${outputPath}`
		);
	});

	context.subscriptions.push(command1);
}

export function deactivate() {}
