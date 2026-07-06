# Shu Registry Template

官方 registry 的最小仓库模板。

当前官方仓库：https://github.com/CNyezi/shu-registry

## 作者提交插件

在 `submissions/` 里新增一个 JSON 文件：

```json
{
  "repo": "https://github.com/you/your-shu-plugin"
}
```

插件仓库需要使用 GitHub Release，并在 latest release 里提供一个 `.pcp` asset。

## 维护者更新 registry

PR 会运行 `validate-submissions.yml`：

1. 读取 `submissions/*.json`
2. 查每个仓库的 latest release
3. 找 `.pcp` asset
4. 运行 `npm run registry:intake -- <asset-url> registry.json`
5. 校验并上传生成的 `registry.json` artifact

维护者 review submission PR。合并后，定时或手动运行 workflow 会把最新生成的 `registry.json` 提交回 `main`。
