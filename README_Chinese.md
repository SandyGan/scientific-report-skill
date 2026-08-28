# Scientific Report Skill（科学报告 Skill）

[English README](README.md)

这是一个证据驱动的 Skill，用于把用户提供的科研项目材料转化为自包含的离线报告。项目的主要产品是 Skill，而不是 npm 包、数据库、Web 服务或 Node.js 应用。

## 用户会得到什么

调用 `$scientific-report`，提供项目材料与报告范围，即可获得一个可移植报告目录，主要入口是 `report.html`。

```text
项目材料
  -> 有边界的来源盘点
  -> 证据账本
  -> 科研与披露评审
  -> 自包含离线 HTML 报告
```

结构化 JSON 是单份报告的证据账本，不是本地数据库，也不需要启动服务。

## 作为 Skill 安装

把本仓库复制到 Codex 的 Skill 目录，或通过兼容的 Skill 安装器安装。包含 `SKILL.md` 的目录就是 Skill 根目录。

调用示例：

```text
使用 $scientific-report，把这些项目材料整理成一份证据驱动、可离线打开的科研报告。
```

Skill 会自动处理来源覆盖、科学记录、缺失信息、冲突、来源追踪、披露、可复现性和渲染。普通用户不需要运行 npm 命令，也不需要手动执行多段 CLI 流程。

## 输出结果

推荐输出结构：

```text
report.html
annex/
assets/
scientific-report.public.json
disclosure-projection.json
validation-attestation.json
package-manifest.json
README.txt
```

用户可直接在浏览器中打开 `report.html`。JavaScript 可以增强导航，但没有 JavaScript 时科学内容仍然可读。

## 科学边界

Skill 会保留未知值、失败、阴性结果、排除、重试、冲突、外部工作、披露限制和分范围可复现性。它不能证明实验确实发生、来源诚实、因果主张有效，也不能替代机构批准。

从 [SKILL.md](SKILL.md) 开始。详细的创作、字段、评审、可复现性、交互、威胁和扩展指南位于 [references/](references/) 中。

## 可选参考运行时

Node.js 是可选的。维护者和高保证工作流可以使用 [tools/reference-runtime](tools/reference-runtime) 执行确定性 Schema 验证、语义检查、渲染、打包和校验。普通用户不需要 Node.js、npm、本地服务器或数据库。

## 仓库结构

| 路径 | 用途 |
|---|---|
| `SKILL.md` | Skill 入口和核心行为 |
| `agents/` | Skill 界面元数据 |
| `references/` | 详细创作与科研评审指南 |
| `protocol/`、`schemas/`、`rules/` | 版本化科学契约 |
| `prompts/` | 核心、阶段和领域指令 |
| `templates/` | 自包含离线报告模板 |
| `examples/` | 合成报告示例 |
| `tools/reference-runtime/` | 可选的私有 Node.js 参考实现 |

使用 [Apache-2.0](LICENSE) 许可。
