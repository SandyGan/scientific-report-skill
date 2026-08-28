# Scientific Report Console（科学报告控制台）

[English README](README.md)

这是一套用于构建证据驱动型科研报告包、且不绑定任何模型或服务供应商的协议与工具链。项目将科学事实与生成文本、展示层分离，使读者能够检查：实际完成了什么、没有完成什么、每项主张由哪些来源支持、哪些冲突仍未解决，以及哪些内容确实可以复现。

预期流程如下：

```text
已登记来源与运行记录
  -> 来源覆盖与原子记录
  -> 规范化科学载荷
  -> 结构与语义验证
  -> 公开披露投影
  -> 确定性离线渲染
  -> 由清单约束的报告包
```

0.1.1 版本是已经通过自动化实现验收的发布候选。提示词输出、渲染页面、Schema 验收结果和验证结果都只能作为评审辅助，不能据此证明某项科学陈述为真，也不能据此认定某份具体科研报告已经适合发表。

## 项目标识

| 表面 | 正式名称 |
|---|---|
| 产品 | **Scientific Report Console（科学报告控制台）** |
| GitHub 仓库和源码目录 | `scientific-report-console` |
| npm 包 | `scientific-report-console` |
| 主要 CLI 命令 | `scientific-report-console` |
| 兼容 CLI 别名 | `report-prompt` |

版本化的 `report_prompt.*` 扩展键和提示词 ID、`report-prompt-*` 工具标识符，以及 `https://schemas.report-prompt.org/` Schema 标识符，都是稳定的 0.1.0 机器契约。它们会有意保留原始命名空间；修改这些标识符属于契约迁移，而不是品牌修改。新的面向用户文档和命令统一使用正式项目名称。

## 核心保证与非保证事项

本协议旨在保留下列重要区别：

- 本项目实际完成的工作、重新分析、上游或外部工作，以及合成工作；
- `planned`、`attempted`、`completed`、`not_performed` 和 `unknown` 等工作状态；
- 效应、统计决策、可解释性、记录处置和技术失败等彼此独立的轴；
- `known`、`unknown`、`not_applicable` 和 `withheld` 等字段状态；
- 直接证据、中间推理、冲突、反证和跨领域桥接；
- 历史调用、重放配方、已验证重跑和独立复现。

在已经实现并实际调用相应检查的范围内，本工具链可以检查声明的结构、引用、规则条件、哈希和报告包属性。它不能证明某个被遗漏的来源从未存在，不能证明输入来源诚实可信，不能证明实验确实按记录执行，不能证明因果解释有效，也不能证明某次重跑在科学意义上具有独立性。这些事项需要来源治理和具备资质的人工评审。

## 契约状态与当前快照的安全使用方式

预期契约包含多个独立版本化的表面：

- `protocol/` 定义规范性的科学与认识论语义；
- `schemas/` 定义当前实现所接受的 JSON 结构；
- `rules/registry.yaml` 登记自动化语义检查；
- 提示词和模板消费这些契约，但不能重新定义它们。

符合性要求这些表面彼此一致。Schema 接受不能覆盖更严格的协议规则；如果当前 Schema 无法表达某个协议术语，也不能因此把相应载荷视为结构有效。当这些表面不一致时，该差异就是发布阻断项——不得自行发明别名，也不得选择更方便的一套词汇。

并行实现期间发现的零基线对齐阻断项，已经在当前协议、Schema、TypeScript 类型、验证器、夹具、提示词和渲染器之间完成协调。历史差异和关闭证据见 [`reviews/zero-based/INTEGRATION_BLOCKERS.md`](reviews/zero-based/INTEGRATION_BLOCKERS.md)。当前字段词典和科研评审量表使用的公开 `withheld` 来源状态与评审结论词汇，与相应 Schema 保持一致。以后任何契约表面之间的新差异仍然属于发布阻断项：在协议、Schema、规则、实现、夹具、文档和渲染全部作为同一次迁移完成之前，不得发明别名，也不得把受影响的载荷描述为符合契约。

## 环境要求

- Node.js 22 或更高版本
- npm

作为普通用户安装已打包版本时，可执行以下命令。请把 tarball 名称替换成 `npm pack` 实际生成的文件名：

```bash
mkdir scientific-report-console-consumer && cd scientific-report-console-consumer
npm init -y
npm install ../scientific-report-console-0.1.1.tgz
npx scientific-report-console --help
```

对于源码检出目录，使用 `npm install` 安装声明的依赖。发布 tarball 会刻意排除 `package-lock.json` 和开发测试源码；应把 tarball 安装到消费项目中，不要把解压后的发布包当作源码检出目录使用。

## 如何使用控制台

请根据目标选择使用路径：

| 目标 | 推荐起点 | 结果 |
|---|---|---|
| 使用随附数据评估控制台 | 运行下文的仅发布模式示例 | 得到可在本地打开、且已经验证的离线报告包。 |
| 使用自己的记录构建报告 | 按顺序执行 `init -> normalize -> project -> validate -> render -> verify` | 评审期间得到工作副本；所有门禁通过后得到发布包。 |
| 把契约集成到其他应用 | 使用[程序化模块导出](#程序化模块导出)中介绍的带类型 ESM 导出 | 直接调用规范化、投影、验证、渲染、打包、校验和生成预检 API。 |

安装包示例使用 `npx scientific-report-console`。如果可执行文件已经位于 `PATH` 中，直接使用 `scientific-report-console` 等价。旧的 `report-prompt` 可执行文件在 0.1.x 中继续作为完全等价的兼容别名。在源码检出目录中，请使用 `npm run cli -- <command>`。

### 1. 先体验随附报告

在一个小型消费项目中安装发布 tarball，渲染仓库随附的跨领域示例，然后验证结果：

```bash
mkdir scientific-report-console-consumer && cd scientific-report-console-consumer
npm init -y
npm install ../scientific-report-console-0.1.1.tgz

npx scientific-report-console demo --release-only --out scientific-report-demo
npx scientific-report-console verify scientific-report-demo
```

在浏览器中打开 `scientific-report-demo/report.html`。报告包是自包含的；复制或归档时应保持整个目录结构不变。验证成功时会输出 `Release bundle verification: PASS` 和 `Release eligible: yes`。

如果希望检查保守的工作副本流程，请执行不带 `--release-only` 的 `npx scientific-report-console demo --out scientific-report-working-copy`。该输出会被有意标记为 `NOT RELEASE-ELIGIBLE`。

### 2. 使用自己的记录构建报告

运行流程前，先确定报告需要覆盖的来源和运行记录、负责科研评审与披露评审的人员，以及必须随报告提供的公开且可用工件。控制台不会替你发现权威来源全集，也不会替你决定哪些内容可以公开。

创建空白脚手架：

```bash
npx scientific-report-console init work \
  --title "Bounded scientific report" \
  --project-id project.example
```

参照[创作指南](docs/authoring-guide.md)和[字段词典](docs/field-dictionary.md)编辑 `work/authoring-input.json`。登记真实的来源身份和定位信息；未知值必须保持未知；失败、阴性、排除、外部和未执行工作都必须保留。不得只为满足 Schema 而填入看似合理的默认值。

规范化创作输入，并检查由此产生的评审任务：

```bash
npx scientific-report-console normalize work/authoring-input.json \
  --out work/scientific-report.canonical.json \
  --created-at 2026-08-28T00:00:00.000Z \
  --report-id report.example \
  --report-version 1

npx scientific-report-console todo work/scientific-report.canonical.json
```

请把示例时间戳和标识符替换成该报告实际登记的值。当仍有阻断性未知项或评审任务时，规范化命令可能已经写出有用的规范候选文件，但仍以非零状态退出。应把这种情况理解为报告尚未完成，而不是命令崩溃；请检查输出的发现项，修正后再次运行 `todo`。

创建 `work/policy.json`，命名公开投影所使用的披露策略。一个默认保留的最小策略如下：

```json
{
  "policy_id": "policy.example.public-v1",
  "policy_version": "1",
  "rules": {
    "default_action": "retain"
  }
}
```

如果来源报告属于内部或受限级别，还要创建 `work/instructions.json`，并为每一项科学变更提供经过评审的显式字段操作。指令使用 RFC 6901 来源指针以及[披露策略](protocol/disclosure-policy.yaml)中记录的操作；不能用默认保留策略代替披露评审。

创建公开投影，然后验证来源报告与投影报告这一对文件：

```bash
npx scientific-report-console project work/scientific-report.canonical.json \
  --out work/scientific-report.public.json \
  --projection-out work/disclosure-projection.json \
  --projection-id projection.example.public-v1 \
  --created-at 2026-08-28T00:00:00.000Z \
  --policy work/policy.json

npx scientific-report-console validate work/scientific-report.public.json \
  --source-report work/scientific-report.canonical.json \
  --projection work/disclosure-projection.json \
  --attestation-out work/validation-attestation.json
```

如果已经创建了经过评审的字段操作，请在 `project` 命令中添加 `--instructions work/instructions.json`。仅当不需要任何字段操作，且来源披露状态允许投影保持不变时，才可以省略该参数。除可选的证明文件输出外，验证操作是只读的。即使已经写出证明文件，验证命令以非零状态退出仍表示报告不具备发布资格。

在创作和评审期间，应渲染一个带有明确标记的工作副本：

```bash
npx scientific-report-console render work/scientific-report.public.json \
  --source-report work/scientific-report.canonical.json \
  --projection work/disclosure-projection.json \
  --artifact-root work \
  --out work/report-working-copy \
  --working-copy

npx scientific-report-console verify work/report-working-copy --working-copy
```

当所有结构、语义、披露、可复现性和所需人工评审门禁都通过后，省略 `--working-copy`，构建并验证发布包：

```bash
npx scientific-report-console render work/scientific-report.public.json \
  --source-report work/scientific-report.canonical.json \
  --projection work/disclosure-projection.json \
  --artifact-root work \
  --out work/report-bundle

npx scientific-report-console verify work/report-bundle
```

如果命令以非零状态退出、验证仅为完整性检查，或者输出包含 `NOT RELEASE-ELIGIBLE`，绝不能发布该报告包。`--working-copy`、`--allow-extra-files`、Schema 接受和 HTML 成功渲染，都不能覆盖发布门禁。

### 工作流程生成的文件

| 路径 | 用途 |
|---|---|
| `work/authoring-input.json` | 由人工编辑的精简创作输入。 |
| `work/scientific-report.canonical.json` | 权威的规范化科学候选；必须实施适当的访问控制。 |
| `work/scientific-report.public.json` | 用于公开渲染、已经过披露投影的科学载荷。 |
| `work/disclosure-projection.json` | 来源到公开字段操作的哈希绑定记录。 |
| `work/validation-attestation.json` | 与一个精确载荷绑定的验证结果；载荷发生任何修改都会使旧证明失效。 |
| `work/report-bundle/report.html` | 离线报告的主要入口。 |
| `work/report-bundle/package-manifest.json` | 报告包清单、哈希、身份、入口和验证范围。 |

运行 `npx scientific-report-console <command> --help` 可以查看具体命令选项，运行 `npx scientific-report-console explain [rule-code]` 可以查看验证规则。每个报告包内生成的 `README.txt` 会说明该特定产物应如何打开和解释。

## 源码检出目录快速开始

以下命令与 `package.json` 保持一致：

```bash
# 开发期间显示 CLI 帮助
npm run cli -- --help

# 验证跨领域示例
npm run validate:example

# 把带有保守标记的评审演示渲染到单独路径
npm run demo -- --out dist/demo-working-copy --force

# 把受发布门禁约束的示例渲染到 dist/demo（显式安全替换）
npm run render:example -- --force

# 验证渲染后的发布门禁报告包
npm run verify:bundle
```

除非显式指定 `--force`，`render` 和 `demo` 会拒绝替换已有输出目录。因此，上面的快速开始命令为演示和发布门禁输出使用不同路径，并明确选择替换，使整个流程可以重复执行。工作副本验证通过只覆盖其声明的完整性和可移植性范围，不会使该产物获得发布资格。

这些命令会实际执行 `package.json` 中声明的公开脚本。记录检查时，应保留命令输出和退出状态。入口缺失、非零退出、测试套件被跳过、证明不完整，或只进行了限定范围的工作副本验证，都不能视为发布通过。

### 端到端 CLI 契约

第一方命令顺序为 `init -> normalize -> project -> validate -> render -> verify`：

```bash
scientific-report-console init work --title "Bounded report" --project-id project.example
scientific-report-console normalize work/authoring-input.json \
  --out work/scientific-report.canonical.json \
  --created-at 2026-08-24T00:00:00.000Z \
  --report-id report.example --report-version 1

# policy.json 必须包含 policy_id、policy_version 和 rules。
# instructions.json 是可选的显式 sourcePointer/action 记录数组。
scientific-report-console project work/scientific-report.canonical.json \
  --out work/scientific-report.public.json \
  --projection-out work/disclosure-projection.json \
  --projection-id projection.example.public-v1 \
  --created-at 2026-08-24T00:00:00.000Z \
  --policy work/policy.json

scientific-report-console validate work/scientific-report.public.json \
  --source-report work/scientific-report.canonical.json \
  --projection work/disclosure-projection.json \
  --attestation-out work/validation-attestation.json

scientific-report-console render work/scientific-report.public.json \
  --source-report work/scientific-report.canonical.json \
  --projection work/disclosure-projection.json \
  --artifact-root work \
  --out work/report-bundle

scientific-report-console verify work/report-bundle
```

`project` 是唯一会把 `payload_role` 从 `canonical_authoritative` 改成 `public_projection` 的第一方命令。每项科学变更都必须表现为哈希绑定的字段操作。非公开来源报告不能使用空指令集。`validate` 会验证来源与投影这一对文件，并把生成的投影记录绑定进证明。`render` 会重复该验证，从 `--artifact-root` 复制所有声明为公开、可用且等级为 R1 或更高的依赖，使用包自带模板，完成打包并执行发布验证。

未完成的脚手架应保留阻断性评审任务。完成投影后，它只能使用 `--working-copy` 进行渲染；生成的清单和验证器输出会显示 `NOT RELEASE-ELIGIBLE`，而 `verify --working-copy` 只执行完整性验证。`--working-copy` 和 `--allow-extra-files` 都不能产生具备发布资格的结果。

### 程序化模块导出

安装包公开以下带类型的 ESM 子路径：`scientific-report-console/normalizer`、`/projection`、`/validator`、`/renderer`、`/bundler`、`/verifier` 和 `/generation`。发布流程使用以下规范函数：

- `normalizeAuthoringInput` / `normalizeAuthoringFile`；
- `projectDisclosure` 和 `verifyDisclosureProjection`；
- `validateReport` / `validateReportFile`。对于公开载荷，传入 `disclosureProjection: { sourceReport, projection }`；
- 对已经完成投影的载荷使用 `renderReport(report, { outDir, attestation })`；
- `bundleDirectory` 和 `verifyBundle`；
- 使用 `validatePromptComposition`、`validateGenerationExchange` 和 `applyGenerationResponse` 完成由请求授权的生成预检和原子应用；
- 使用 `resolveGenerationProfile` 和 `normalizeS2Response` 执行版本与哈希精确固定的确定性 S3 路由。

即使请求和响应都通过 JSON Schema，生成响应仍然是不可信输入。`validateGenerationExchange` 还要求请求与响应身份和哈希匹配、使用当前精确提示词包、已处理与省略单元构成精确有序分区、授权根由请求方所有、根/对象/目标映射一致，并将来源绑定与可信提取字节协调一致。`applyGenerationResponse` 会先执行这道门禁，然后检查基础报告身份、版本和哈希，原子应用操作，并验证最终规范报告。领域包载荷只有一个保留的追加路由 `/extensions/domain_payloads/-`，不允许任意修改 `/extensions`。`normalizeS2Response` 是唯一被接受的 S3 实现，只解析已安装的 `normalization-profile:s2-preserving-v1` 及相应 normalizer 元组；它会保留操作、不利诊断、来源信息和续传状态，而不是调用模型。

运行项目检查：

```bash
npm run typecheck
npm test
npm run build
```

也可以运行组合检查：

```bash
npm run check
```

`npm run check` 会依次运行类型检查、测试套件和生产构建。命令成功只覆盖当前仓库中已经实现的检查；它不是科学批准，也不代表来源完整。

执行 `npm run build` 后，包会通过 `dist/cli/index.js` 暴露 `scientific-report-console` 可执行文件。开发期间建议使用 `npm run cli -- <command>`，以便直接使用 TypeScript 入口。

## 工作模型

### 1. 登记来源全集

声明报告试图覆盖的、边界明确的一组 ELN 条目、文件、仪器运行、计算任务、试验、轨迹、出版物和人工证明。每个已登记来源都应被处置为 `included`、`excluded_with_reason`、`unreadable`、`inaccessible`、`duplicate` 或 `unmapped` 等状态之一。

如果不存在权威来源全集，报告可以说明所有“已登记”来源都已处理，但不得声称总体完整。

### 2. 编写科学记录

为科学问题、实体、工作单元、尝试、片段、方法、结果、失败、证据、主张、工件和可复现性单元创建或规范化记录。来源派生值必须绑定到定位信息。未知值必须保持未知；不得推断缺失的样本量、随机种子、版本、时间戳、路径、单位或引用。

参见[创作指南](docs/authoring-guide.md)和[字段词典](docs/field-dictionary.md)。

### 3. 验证声明

验证分为多层。JSON Schema 确定数据形状；语义规则评估跨对象要求，例如来源处置、完成证据、派生闭包、主张支持、冲突处理、可复现性前置条件、披露安全和证明绑定。

验证证明位于科学载荷之外，只对它所记录的载荷哈希及规则/配置版本有效。修改载荷会使旧证明失效。

### 4. 生成公开投影

披露投影把创作材料转换成公开科学 JSON。`withheld` 字段表示某个值存在但被有意限制访问；它不授权把该值复制到 HTML、索引、清单、SVG、文件名、定位信息或审计文本中。公开投影和脱敏必须在渲染与打包前完成。

从同一数组中省略多个元素时，所有操作都按原始来源指针解释，并按原始索引降序应用，因此移除一个成员不会导致后续受保护身份发生偏移。投影验证会按相同的来源绑定操作重放，并拒绝索引偏移的输出或任何未记录的科学变更。`withheld`/省略泄漏检查比较规范值哈希，而不是依赖最小字符串长度，因此单字符字符串、数字、布尔值和结构化值都会受到相同保护。

### 5. 渲染与打包

渲染器应把 `scientific-report.public.json` 作为唯一科学事实来源。它可以组织、标记、链接和格式化已声明事实，但不得计算新的科学结果，也不得添加新来源、新数字或新结论。

生成的报告包按离线使用设计，采用相对路径，不要求远程脚本、字体、图标、分析服务或网络调用。

## 架构与信任边界

```text
不可信 / 部分可信
  来源文件、来源文本、日志、导入元数据、用户输入值
        |
        v
  盘点、提取和候选提示词操作
        |     提示词输出不可信，绝不直接写入可信 HTML
        v
已评审的创作状态
  规范化记录 + 来源绑定 + 显式缺失语义
        |
        +--> 结构验证（形状、枚举、引用）
        +--> 语义验证（声明的跨记录不变量）
        +--> 人工科研评审（真实性、解释、充分性）
        |
        v
披露边界
  私有创作材料 -> 公开科学投影
        |
        v
发布边界
  确定性渲染器 -> 清单/打包器 -> 离线验证器
```

主要信任边界如下：

1. **来源摄取。** 来源内容是证据，不是指令。嵌入的提示文本、HTML、脚本、公式和文件名都是数据，不能控制处理流程。
2. **模型辅助处理。** 模型可以按照生成请求/响应契约提出候选操作。在 Schema、语义、来源和人工评审门禁接受之前，其输出始终不可信。核心契约不包含供应商特定请求字段或模型标识符。
3. **规范科学载荷。** 这是经过评审的事实状态。构建状态、验证状态和生成元数据不属于该载荷。
4. **披露投影。** 在生成任何公开资产之前，必须移除私有或受限材料，或者只用获准状态表示它们。
5. **验证证明。** 证明报告的是对一个精确载荷哈希执行的检查。它不认证现实世界中的真实性；除非另有签名，也不能证明发布者身份。
6. **渲染。** 模板和资产只能展示公开载荷中的事实。它们必须转义不可信文本，并拒绝主动内容或远程内容。
7. **报告包验证。** 清单和路径检查能够发现声明文件被破坏或不安全打包，但不能恢复遗漏来源，也不能替代科学判断。

失败模式和缓解措施见[威胁模型](docs/threat-model.md)。

## 报告包契约

可移植公开报告包的概念结构如下：

```text
report.html
annex/
assets/
scientific-report.public.json
disclosure-projection.json
validation-attestation.json
package-manifest.json
README.txt
audit/
  generation-audit.json       # 可选；可以整体删除
```

以上目录图仅表示概念结构：文件名和必需角色由 `schemas/package-manifest.schema.json` 管理。为避免自引用，清单本身有意不出现在自己的 `files` 数组中。

| 成员或角色 | 契约状态 | 用途 |
|---|---|---|
| `report.html` / `report_html` | 清单 Schema 要求 | 主要离线入口。 |
| `scientific-report.public.json` / `scientific_report_public` | 必需 | 唯一的公开科学事实来源。 |
| `disclosure-projection.json` / `disclosure_projection` | 必需 | 完整的来源到公开投影记录，与公开规范哈希和验证证明绑定。 |
| `validation-attestation.json` / `validation_attestation` | 必需 | 与公开载荷哈希及披露投影绑定的检查记录。 |
| `README.txt` / `package_readme` | 必需 | 离线包说明和限制。 |
| `package-manifest.json` | 作为清单对象是必需的，但不列为自身成员 | 发布身份、文件清单、哈希、入口和包检查。 |
| 附录页面、本地样式/脚本/图标、搜索索引 | 条件必需 | 静态细节和可选交互资产；如果随包提供，必须列入 `files`。 |
| 人工评审证明 | 可选包成员；存在且精确绑定时具有权威性 | 独立且可追责的评审证据。验证会绑定报告身份/版本、科学哈希、验证证明身份/哈希和观测到的验证状态。在发布模式中，任何精确绑定但不等于 `approve` 的结论——尤其是 `block_release`——以及任何科学 `concern` 或未解决评审任务，都会构成错误，并使 `ok` 和 `releaseEligible` 同时为 false。完整性检查模式可以读取这些字节，但始终报告 `releaseEligible: false`。 |
| `audit/generation-audit.json` | 可选且可删除 | 外围生成历史；绝不是科学证据，也不能提高可复现性等级。 |

### 必需不变量

- `scientific-report.public.json` 是公开 HTML 和附录页面的唯一科学事实来源。
- `validation-attestation.json` 与科学载荷分离，并绑定其密码学哈希和精确披露投影记录。
- 每个 HTML、附录、样式、脚本和图标成员都会与使用包自带模板重新执行的确定性渲染结果逐字节比较；仅围绕矛盾 HTML 重建清单会验证失败。
- 每个 R1 或更高可复现性单元声明的公开、可用依赖，都会被复制、检查哈希和大小、标为必需，并通过清单中的 `source_artifact_id` 完成绑定。
- `package-manifest.json` 按照自身 Schema 枚举发布文件及其完整性元数据。
- 路径必须为相对路径、经过规范化、位于报告包根目录内，并且在不同目录之间可移植。
- 公开文件不得包含原始 `withheld` 值、秘密、凭据、不安全绝对路径或必需远程资源。
- 即使没有 JavaScript，报告仍然必须可以进行科学阅读。JavaScript 可以增强搜索、筛选和检查，但不能成为事实的唯一载体。
- 搜索和筛选不得从底层归档中静默移除失败、排除、反证、撤回或缺失信息。
- 删除可选生成审计后，科学内容、科学载荷哈希、验证状态和可复现性状态必须保持不变。
- 修改载荷后，必须重新生成投影、证明、渲染、清单并执行验证。不得把旧证明复制进重建后的报告包。

协议定义规范性的科学语义；兼容 Schema 定义精确的必需序列化字段。Schema 与协议不一致属于发布阻断项，不能选择其中较方便的一套词汇。报告包中文件存在且哈希通过，并不代表每个科学对象都有充分证据。

## 目录说明

| 路径 | 用途 | 信任角色 |
|---|---|---|
| `.github/` | CI 工作流、依赖更新、Issue 表单和 Pull Request 模板 | 仓库自动化与协作策略 |
| `LICENSE`、`CHANGELOG.md`、`CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md` | 许可证、发布历史、贡献规则、漏洞流程和社区规范 | 公开仓库治理 |
| `PROJECT_PLAN.md` | 路线图、设计理由和目标仓库结构 | 规划上下文；不是可执行或序列化契约 |
| `package.json`、`package-lock.json`、`tsconfig.json` | 开发命令、锁定的 JavaScript 依赖和 TypeScript 编译配置 | 构建配置；命令存在不等于已经成功执行 |
| `adr/` | 关于完整性、计数、主张图、可复现性、标识符、报告包、披露和运行时的已接受架构决策 | 理由和兼容性约束 |
| `protocol/` | 认识论、适用性、覆盖、状态、结果、论证、披露和门禁策略 | 人类可读的策略来源 |
| `schemas/` | 创作、规范载荷、投影、配方、生成、证明和清单契约 | 结构契约 |
| `schemas/defs/` | 可复用的来源、工作、谱系、派生、论证、调用、环境和随机状态定义 | 共享结构词汇 |
| `schemas/packs/` | 增量式湿实验、AI/ML 和分子动力学 Schema 包 | 领域扩展；不得放宽核心规则 |
| `prompts/` | 供应商中立的完整性指令、阶段提示词、领域片段和示例 | 只用于生成候选操作 |
| `rules/` | 语义规则注册表、严重性配置和领域覆盖层 | 自动化声明检查 |
| `reviews/` | 跨表面发现项和发布阻断项 | 评审证据；未解决阻断项会阻止符合性声明 |
| `src/` 和规划中的 `tooling/` 模块 | 用于规范化、验证、脱敏、渲染、打包和校验的 CLI 与实现模块 | 已存在模块中的可执行强制机制 |
| `templates/scientific-console/` | 离线报告模板、局部模板、样式、脚本和图标 | 确定性展示规范/实现 |
| `examples/` | 最小、领域、跨领域、失败、冲突和受限数据示例 | 演示和夹具，不是生产证据 |
| `tests/` | Schema、语义、提示词、渲染、无障碍、安全和报告包测试 | 只对实际存在且已运行的测试构成回归证据 |
| `docs/` | 创作、评审、复现、交互、威胁和扩展指南 | 操作文档 |
| `dist/` | 生成后的构建或演示输出 | 可丢弃构建产物；绝不是创作事实来源 |
| `adapters/` | 可选的未来供应商特定薄适配器 | 位于供应商中立核心之外 |

并非每个开发快照都必须包含所有规划目录。应检查实际仓库树和版本化 Schema，不要假设某个规划组件已经实现。

## 科研评审

自动化验证与科研评审相互补充：

- 自动化检查回答“引用是否可解析？”、“每个已登记来源是否都已处置？”、“该证明哈希是否匹配？”等问题；
- 科研评审判断来源是否可信、比较是否有意义、对照是否充分、假设是否合理，以及措辞是否与证据强度相称。

发布前请使用[科研评审量表](docs/scientific-review-rubric.md)。评审结论应识别阻断项和未解决任务；不要用一个不透明的单一分数替代评审量表。

## 可复现性

可复现性按每个 `ReproducibilityUnit` 分别评估，而不是给整个报告分配一个含糊徽章。每个单元记录输入与派生闭包、历史调用、建议配方、环境、随机状态、访问条件、验收标准、重跑证据、输出比较和主张覆盖。

未实际执行的配方不等于已验证重跑。同一团队成功完成计算重跑不等于独立复现；独立实验重复也不能与确定性重放互换。参见[可复现性契约](docs/reproducibility-contract.md)。

## 控制台行为

控制台支持 30 秒概览，并允许从科学问题逐步检查到主张、工作历史、派生关系、来源定位和复现材料。静态文档顺序具有权威性；客户端交互只是同一内容的可选视图。参见[控制台交互模型](docs/console-interaction-model.md)。

## 扩展协议

领域包和适配器必须是增量式的。它们可以引入更严格的适用性规则、字段、语义门禁、提示词片段、渲染视图和测试，但不得重新定义缺失语义，不得把外部工作计为本项目完成，不得隐藏失败尝试，不得削弱披露规则，也不得允许展示代码创造科学事实。

参见[扩展指南](docs/extension-guide.md)。

## 当前 MVP 限制

MVP 的范围有意保持收敛。契约对齐以及自动化验证得到具备发布资格的结果，并不能单独使报告获得科学批准或机构发布许可。除非某个仓库版本及其记录的检查与评审明确证明了更多能力，否则应假定存在以下限制：

- 当前契约集中的零基线协议/Schema 词汇阻断项已经解决，但这不能证明未来版本会持续对齐。以后新发现的任何不一致都属于发布阻断项，必须作为一次版本化迁移同步修正规范、Schema、类型、验证器、示例、渲染器、提示词和文档；仍然禁止静默兼容别名。
- 验证证明会区分精确文件字节与 `sorted-keys-utf8-v1` 规范 JSON，并记录所选哈希依据、规范化方法和精确载荷字节大小。实现必须复现声明的依据；不得跨依据比较哈希。
- 发布包只包含编译运行时和声明的协议、Schema、规则、提示词、模板及示例资产。npm 创建 tarball 前，`prepack` 会执行完整检查；绕过 npm 生命周期脚本不能视为有记录的发布构建。
- 系统不会自动发现权威来源全集。作者必须登记并治理该全集。
- 来源解析和模型辅助提取可能遗漏或错误分类记录；必须依据来源定位信息进行复核。
- Schema 验证只证明形状，不证明真实性、因果性、实验充分性、来源真实性或总体完整性。
- 语义规则只覆盖已经枚举的不变量，不覆盖每一种领域特定科研失败模式。
- 实体解析、样本身份、前瞻/自适应/事后时间属性、冲突裁决、排除、因果/机制主张、跨领域等价性和披露决策仍由人工控制。
- 如果没有保存的重跑和比较证据，可复现性等级只是一项声明。MVP 不会替用户完成独立复现。
- 哈希只能发现纳入哈希/清单范围的材料发生了字节变化。未签名文件不能证明作者身份或可信发布时间。
- 离线渲染可以减少网络暴露，但不会自动使任意导入的 HTML、SVG、URL 或文件名变得安全；仍然需要净化和报告包验证。
- 增强搜索、筛选、打印、浏览器兼容性、无障碍和超大报告行为的自动化覆盖可能不完整。无 JavaScript 阅读路径是兜底契约。
- 供应商特定调用、计费、token 统计和 SDK 行为不属于科学核心。可选生成审计数据不得影响科学结论或可复现性评级。
- 本项目不能替代机构对伦理、知情同意、生物安全、数据保护、许可证、记录保留或监管评审的要求。

当某项能力被描述为协议要求时，它是一项预期语义保证。只有在当前使用版本中存在相应 Schema、规则、实现和通过的回归测试时，它才成为自动化保证。

## 许可证

Scientific Report Console 使用 [Apache License 2.0](LICENSE) 许可。除非另有明确说明，提交并纳入项目的贡献也按同一许可证接受。

## 文档

- [字段词典](docs/field-dictionary.md)
- [创作指南](docs/authoring-guide.md)
- [科研评审量表](docs/scientific-review-rubric.md)
- [可复现性契约](docs/reproducibility-contract.md)
- [控制台交互模型](docs/console-interaction-model.md)
- [威胁模型](docs/threat-model.md)
- [扩展指南](docs/extension-guide.md)
- [发布检查清单](docs/release-checklist.md)
