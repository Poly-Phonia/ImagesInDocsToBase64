# 免責事項・著作権
- 当コードはMITライセンスに基づき配布されます。

# これは何
- ドキュメント内で参照している画像ファイルパスをbase64に置き換えるためのVSCodeの拡張機能です。
- v1.0.0時点では`markdown`形式のファイルのみ対応しています。

# 機能
## Markdownファイル内の画像置き換え

以下のような`markdown`文書を、
```markdown
# ヘッダ１

![サンプル用画像](画像/サンプル.png)
```

以下のように置き換えます。
```markdown
# ヘッダ１

![サンプル用画像](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAYAAAB...)
```

これにより、画像ファイルの場所に依存しない`markdown`文書を作成できます。