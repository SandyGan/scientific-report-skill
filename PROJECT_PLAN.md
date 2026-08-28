# `scientific-report-console/` 项目规划

> 状态：0.1.0 发布候选已实现并通过自动化验收；等待创建公开 GitHub 仓库
> 目标用户：从事生物大分子、细胞/分子生物学、AI/ML、分子动力学及跨领域研究的研究者
> 核心产物：可验证的结构化科学事实包、通用提示词流水线、离线 HTML 科研调度台

## 1. 项目定位

`scientific-report-console/` 不应只是保存一条“请写完整报告”的超长提示词，而应是一套**证据账本驱动的科研报告协议**：

```text
项目材料与运行记录
  → 来源盘点与覆盖核对
  → 原子事实提取
  → 结构化科学事实载荷
  → 缺失、冲突和证据门禁
  → 受控科学叙事
  → 确定性 HTML 渲染
  → 离线可复核发布包
```

最终报告的首要任务是让研究负责人明确回答：

1. 研究了什么科学问题，为什么值得研究？
2. 实际做了什么，哪些只计划了、由外部完成或由现有证据推断？
3. 获得了哪些结果，包括失败、阴性结果、冲突结果和被排除结果？
4. 每条关键结论由哪些直接证据和中间推理支持？
5. 科学问题解决到什么程度，哪些边界仍未解决？
6. 研究者如何定位数据、参数、代码、环境、日志和产物，并重放关键计算？
7. 报告在哪些来源边界内可以称为完整，哪些信息仍未知、受限或不可访问？

AI 的调用模型、token、生成轮次等只放在默认折叠的外围附件中，不参与科学结论与复现评级。

---

## 2. 设计原则

### 2.1 科学真实性优先

- 严格区分 `performed`、`planned`、`inferred`、`external`、`not_performed` 和 `unknown`。
- 不因方法描述详细、文本使用过去时或外部论文报告完成，就把工作算作本项目实际完成。
- 未知值保持未知；禁止根据常识补写样本量、批次、参数、seed、版本、时间、路径或引用。
- 失败、阴性结果、反证、排除、重试、撤回和未解决冲突必须进入正式事实载荷。

### 2.2 先证明覆盖边界，再谈“完整”

每份报告必须声明 `SourceUniverse`：本报告尝试覆盖哪些 ELN 条目、文件、仪器运行、HPC job、ML trial、MD trajectory/restart、论文或人工声明。

每个已登记来源必须处置为：

- `included`
- `excluded_with_reason`
- `unreadable`
- `inaccessible`
- `duplicate`
- `unmapped`

若没有可核对的权威来源全集，报告只能说“已登记来源处理完成”，并明确显示“总体完整性不可证明”。

### 2.3 科学事实与展示分离

- `scientific-report.public.json` 是公开 HTML 的唯一科学事实源。
- 提示词输出只能生成候选 patch，不能直接生成可信 HTML。
- 验证状态保存在独立 `validation-attestation.json` 中，并绑定科学载荷 hash。
- HTML 只做确定性展示，不产生新结论、新数字或新引用。

### 2.4 可复现不是一个模糊总分

按关键 `ReproducibilityUnit` 分别评估：

- 来源与派生闭包；
- recipe 与历史实际命令的一致性；
- 数据/工件访问条件；
- 环境与随机状态完整性；
- 是否完成验证重跑；
- 是否为独立计算复现或独立实验重复；
- 覆盖了多少关键结论与输出。

报告总览只显示关键单元的保守下界、等级分布、覆盖分母和访问条件。

### 2.5 通用核心 + 领域包

核心协议处理所有科研任务共有的对象：问题、活动、尝试、方法、结果、失败、证据、主张、冲突、来源、工件和复现。湿实验、AI/ML、MD 领域包只能增加字段和门禁，不能放宽核心真实性规则。

---

## 3. 推荐仓库结构

标记：`[MVP]` 为首个可用闭环；`[1.0]` 为正式版；`[Later]` 为后续扩展。

```text
scientific-report-console/
├── README.md                                      [MVP]
├── PROJECT_PLAN.md                                [已创建]
├── VERSION                                        [MVP]
├── CHANGELOG.md                                   [1.0]
│
├── protocol/                                      [MVP]
│   ├── epistemic-contract.yaml
│   ├── field-applicability.yaml
│   ├── source-coverage.yaml
│   ├── work-state-and-counting.yaml
│   ├── result-axes.yaml
│   ├── decision-timing.yaml
│   ├── argument-and-bridge.yaml
│   ├── reproducibility-policy.yaml
│   ├── disclosure-policy.yaml
│   ├── report-modes.yaml
│   └── gates.yaml
│
├── schemas/                                       [MVP]
│   ├── authoring-input.schema.json
│   ├── scientific-report.schema.json
│   ├── disclosure-projection.schema.json
│   ├── package-manifest.schema.json
│   ├── validation-attestation.schema.json
│   ├── recipe.schema.json
│   ├── generation-request.schema.json
│   ├── generation-response.schema.json
│   ├── generation-audit.schema.json               # 可选外围审计
│   ├── defs/
│   │   ├── source-coverage.schema.json
│   │   ├── work-execution.schema.json
│   │   ├── material-lineage.schema.json
│   │   ├── result-and-disposition.schema.json
│   │   ├── quantitative-derivation.schema.json
│   │   ├── claim-argument.schema.json
│   │   ├── reproducibility-unit.schema.json
│   │   ├── invocation.schema.json
│   │   ├── environment.schema.json
│   │   └── random-state.schema.json
│   └── packs/
│       ├── wet-lab.schema.json
│       ├── ai-ml.schema.json
│       └── molecular-dynamics.schema.json
│
├── prompts/                                       [MVP]
│   ├── README.md
│   ├── core/
│   │   ├── scientific-integrity.md
│   │   ├── untrusted-input-boundary.md
│   │   ├── missingness-and-status.md
│   │   └── output-patch-contract.md
│   ├── stages/
│   │   ├── 01-inventory-snapshot.md
│   │   ├── 02-extract-atomic-records.md
│   │   ├── 03-model-work-and-decisions.md
│   │   ├── 04-model-material-and-derivation.md
│   │   ├── 05-build-argument-graph.md
│   │   ├── 06-assess-conflict-and-uncertainty.md
│   │   ├── 07-challenge-and-resolve.md
│   │   └── 08-controlled-wording.md
│   ├── packs/
│   │   ├── wet-lab.md
│   │   ├── ai-ml.md
│   │   └── molecular-dynamics.md
│   └── contracts/
│       ├── request.example.json
│       ├── response.example.json
│       └── cannot-complete.example.json
│
├── rules/                                         [MVP]
│   ├── registry.yaml
│   ├── severity-profiles.yaml
│   └── domain-overlays/
│       ├── wet-lab.yaml
│       ├── ai-ml.yaml
│       └── molecular-dynamics.yaml
│
├── tooling/                                       [MVP]
│   ├── authoring-cli/
│   ├── normalizer/
│   ├── validator/
│   ├── redactor/
│   ├── renderer/
│   ├── bundler/
│   └── verifier/
│
├── templates/scientific-console/                  [MVP]
│   ├── report.html
│   ├── annex.html
│   ├── partials/
│   │   ├── global-overview.html
│   │   ├── resolution-ledger.html
│   │   ├── argument-inspector.html
│   │   ├── execution-history.html
│   │   ├── results-and-failures.html
│   │   ├── methods-and-parameters.html
│   │   ├── provenance-and-reproduction.html
│   │   └── supplemental-ai-audit.html
│   └── assets/
│       ├── report.css
│       ├── print.css
│       ├── report.js
│       └── icons.svg
│
├── examples/                                      [MVP]
│   ├── minimal/
│   ├── wet-lab/
│   ├── ai-ml/
│   ├── molecular-dynamics/
│   ├── cross-domain/
│   ├── negative-failure-retry/
│   ├── conflict-and-adjudication/
│   └── restricted-data/
│
├── tests/                                         [MVP]
│   ├── schema/
│   ├── applicability/
│   ├── coverage/
│   ├── state-transitions/
│   ├── material-lineage/
│   ├── derivation/
│   ├── argument-graph/
│   ├── reproducibility/
│   ├── prompt-conformance/
│   ├── render-semantics/
│   ├── accessibility/
│   ├── security-and-redaction/
│   └── fixtures/
│
├── docs/                                          [MVP]
│   ├── field-dictionary.md
│   ├── authoring-guide.md
│   ├── scientific-review-rubric.md
│   ├── reproducibility-contract.md
│   ├── console-interaction-model.md
│   └── threat-model.md
│
└── adapters/                                      [Later]
    └── provider-specific thin adapters
```

核心 schema、规则、提示词和 HTML 契约保持供应商中立。若需要单一参考实现，推荐 TypeScript/Node LTS，以同一运行时覆盖 JSON Schema、确定性 HTML 和浏览器测试；该选择不得写入科学数据契约。

---

## 4. 规范科学数据模型

### 4.1 根级对象

每份报告至少包含：

- `report_id`、`project_id`、`report_version`、`schema_version`
- `title`、`language`、`report_mode`
- `scope`、`cutoff`、纳入和排除边界
- `module_manifest`
- `section_coverage`
- `source_coverage`
- `research_questions`
- `entities`
- `work_units`
- `methods`
- `results`
- `failures`
- `claims`
- `evidence_items`
- `artifacts`
- `reproducibility_units`
- `limitations`
- `revision_events`
- `disclosure_state`

验证状态、构建状态和 AI 审计不进入科学事实载荷。

### 4.2 明确的缺失语义

来源派生且可能缺失的科学字段使用统一 envelope：

```json
{
  "state": "known | unknown | not_applicable | withheld",
  "value": null,
  "source_bindings": [],
  "missing_reason": null,
  "provenance_status": "complete | partial | absent"
}
```

规则：

- `known` 必须有非空值和来源/派生；
- `unknown` 必须说明缺失原因；
- `not_applicable` 必须由适用性规则支持；
- `withheld` 不得在公开包的 HTML、JSON、索引、SVG 或文件名中泄露原值；
- 禁止使用空字符串、`TBD`、`N/A` 等模糊哨兵值；
- 章节若不适用或无记录，应通过 `SectionCoverage` 明示，不能静默省略。

### 4.3 执行历史

```text
Campaign
  └── WorkUnit
      └── Attempt
          └── Segment
```

- `WorkUnit` 表达一个有明确完成标准的科研工作单元。
- `Attempt` 表达一次实际尝试。
- `Segment` 表达一次运行中的阶段、restart 或 checkpoint 区间。
- 重试只能追加，不能覆盖原失败。
- 同一 attempt 可以同时具有可用的早期结果、后续技术失败、主分析排除和敏感性分析纳入。

工作状态：

```text
planned | attempted | completed | not_performed | unknown
```

执行范围：

```text
this_project | reanalysis | external_study | upstream_collaborator | synthetic
```

### 4.4 结果使用正交轴

避免把“失败”“没有效应”“被排除”混在一个枚举中：

- `scientific_effect_class`：increase、decrease、no_detectable_effect、equivalent、heterogeneous、not_estimated 等；
- `statistical_decision`：reject_null、do_not_reject_null、equivalent、inconclusive 等；
- `interpretability_status`：interpretable、qualified、inconclusive、not_interpretable；
- `record_disposition`：primary、sensitivity_only、excluded、superseded、retracted 等；
- 技术失败单独使用 `FailureEvent`。

“无显著性”默认不等于“没有生物学效应”。只有有效对照、QC、检测限/MDE、区间及必要的等效界充分时，阴性结果才有资格支持生物学反证。

### 4.5 数值派生闭包

所有定量主张应尽可能闭合为：

```text
DataSlice
  → DerivationRecord
  → AnalysisRun
  → OutputArtifact
  → EvidenceItem
  → Claim
```

`DataSlice` 应表达输入版本、表/列/行或可验证查询、过滤条件和 slice hash。`AnalysisRun` 应表达代码、命令参数、环境、随机状态、运行时间、退出状态和输出 hash。

### 4.6 主张—证据—推理图

- `Claim → EvidenceItem`：直接证据；
- `Claim → ArgumentStep → Claim`：中间推理；
- `ClaimDependency`：版本化依赖与上游失效传播；
- `CrossDomainBridge`：连接 MD、结构、序列、AI 与湿实验，明确实体版本、构建体、条件、剂量和时间尺度是否相容；
- `ConflictSet`：同一上下文和 estimand 的不兼容值；
- 条件或时间点不同的相反结果保留为异质性，不应被压成单一“冲突值”。

### 4.7 科学问题解决状态

每个问题需要预先或事后明确解决标准状态：

```text
predefined | adaptive | post_hoc | missing | not_applicable
```

总状态：

```text
resolved | partially_resolved | unresolved | not_addressed | not_evaluable
```

没有合法解决标准时，不能因“做了很多工作”而标为 resolved。

---

## 5. 提示词体系

### 5.1 为什么采用多阶段提示词

单一最终提示词容易发生四类错误：

1. 输入中未出现的失败或运行被永久漏掉；
2. 计划、推断和外部工作被叙述成已完成；
3. 模型为了文本流畅而补写未知参数；
4. 在写摘要时压缩掉矛盾、反证、排除和限制。

因此每个阶段只完成一种信息操作，并输出结构化候选 patch。

### 5.2 阶段设计

| 阶段 | 职责 | 关键门禁 |
|---|---|---|
| S0 来源全集与快照 | 确认研究边界和来源清单 | 未声明覆盖边界不得发布 |
| S1 来源盘点 | 识别文件、日志、运行、解析失败 | 每个源项有处理状态 |
| S2 原子事实抽取 | 提取活动、参数、结果、失败、材料和引用 | 每项绑定精确 source span |
| S3 规范化 | 分配正式 ID、单位和枚举；登记冲突 | 禁止猜测单位或自动合并实体 |
| S4 工作与决策建模 | 构建 WorkUnit/Attempt/Segment、DecisionEvent | completed 和 prospective 必须有证据 |
| S5 物质与派生建模 | 构建样本流、分析总体、DataSlice、AnalysisRun | biological N 和数值派生可核对 |
| S6 论证图 | 构建 Claim、Evidence、ArgumentStep、Bridge | 不得引入新事实，图必须无环 |
| S7 挑战与解决 | 查找反证、替代解释、依赖重复、冲突和缺口 | 所有高风险主张必须经过反向审查 |
| S8 受控措辞 | 将已验证状态转成读者友好语言 | 不得生成新数字、来源或结论 |

### 5.3 提示词请求契约

每次调用至少提供：

- 目标 schema 版本；
- 报告范围和模式；
- 启用的领域包；
- source universe 与 snapshot 引用；
- 带 content ID、parser 版本和 locator 的输入 chunk；
- 已有 ID registry 与对象版本；
- 披露级别；
- 上下文预算和 continuation cursor。

### 5.4 提示词响应契约

每次响应至少包含：

```text
status = ok | needs_review | cannot_complete
candidate_operations[]
source_bindings[]
processed_item_ids[]
excluded_item_ids[]
unreadable_item_ids[]
conflicts[]
missingness[]
review_tasks[]
forbidden_inferences_detected[]
continuation:
  complete | truncated
  omitted_item_ids[]
  next_cursor
```

输入不足时必须返回 `needs_review` 或 `cannot_complete`，不能用流畅散文绕过。

### 5.5 必须人工确认

以下事项不交给模型独立裁决：

- 样本/实体合并、换标和跨领域身份对应；
- completed 的完成依据存在争议；
- prospective/adaptive/post hoc 的时序；
- 同一数值冲突的最终裁决；
- 关键排除、异常值和分析总体；
- 高影响因果或机制主张；
- 跨领域构建体、序列和条件对齐；
- 更正/撤回后的影响范围；
- 伦理、许可和公开脱敏策略。

---

## 6. HTML 科研调度台

### 6.1 页面目标

- **30 秒总览**：知道问题、回答、解决程度、关键结论、最强反证、完成/失败范围和最大复现缺口。
- **三次以内下钻**：从结论到实际方法参数、数据切片、失败 attempt、来源 locator 或工件。
- **完整归档**：关闭 JavaScript、打印或离线移动后，科学内容仍完整可访问。

### 6.2 信息层级

- **L0 全局态势**：问题、范围、限定答案、解决状态、1–2 条关键结论、首要反证/阻断、完成与失败计数、复现状态。
- **L1 领域主页**：湿实验、AI/ML、MD、跨域论证及通用执行账本。
- **L2 对象详情**：单个 claim、attempt、sample、dataset、model、simulation、result 或 conflict。
- **L3 方法与复现**：actual/planned 参数、protocol、命令、环境、随机状态、输入/checkpoint/输出、recipe 差异。
- **L4 来源定位**：页、图、表、行、时间戳、帧、JSON Pointer、content ID、parser 版本和 revision 链。

### 6.3 最小布局

```text
+------------------------------------------------------------------------+
| 报告/版本 | 截止范围 | 搜索 | 筛选 | 导出 | 验证与覆盖状态          |
+------------------------------------------------------------------------+
| 研究问题与边界                                                        |
| 限定答案                                  [部分解决/完整性不可证明]    |
| 关键结论 1                              首要反证或阻断                 |
| 本项目 WorkUnit 5/8 | Attempt 失败 2/11 | 来源处置 9/10               |
| 关键复现单元：R1–R2@指定环境，覆盖 4/5                                |
+----------------------+-------------------------------------------------+
| 导航                 | 主账本/领域主页                                 |
| - 问题解决           |                                                 |
| - 执行与失败         | 点击对象后打开证据检查器                        |
| - 样本/数据/体系     |                                                 |
| - 方法与派生         |                                                 |
| - 工件与复现         |                                                 |
| - 冲突与更正         |                                                 |
+----------------------+-------------------------------------------------+
| 来源、版本、限制、验证 attestation                                     |
+------------------------------------------------------------------------+
| AI 过程审计：可选、默认折叠、不进入科学打印摘要                        |
+------------------------------------------------------------------------+
```

### 6.4 视觉方向

- 视觉隐喻来自实验控制台和技术档案，而不是营销 dashboard。
- 冷灰底色与单一蓝绿色强调；琥珀只用于警告，红色只用于 blocker/security。
- 科学上的下降或负效应不用红色，以免暗示“坏结果”。
- 正文用清晰的人文无衬线；ID、路径、参数、hash 用等宽字体；数值使用 tabular figures。
- 状态同时使用文字、图标、边框和 DOM 属性，不仅依赖颜色。
- 桌面采用双栏；移动端线性化，不压缩成不可读三栏。
- 支持 reduced motion、forced colors、400% reflow、键盘和屏幕阅读器。

### 6.5 图表语法

按数据任务选图，不默认画图：

- 流程与依赖：有向流程/谱系图；
- 时间变化：单轴折线或小多图；
- 分布与重复：点图、区间图、箱线/小提琴按数据量慎用；
- 模型性能：点估计 + 区间，校准图和 subgroup small multiples；
- MD：逐 replica 时间序列、分布、running estimate、相关时间/有效样本量；
- 样本/QC：物质流、批次矩阵、控制组状态；
- 复现状态：分轴表格或状态矩阵，不使用不透明综合分数。

规则：禁止双 y 轴和彩虹色；多系列颜色固定映射；所有图有表格替代视图；失败和缺失状态不应因筛选而静默消失。

### 6.6 离线发布包

```text
report.html
annex/
assets/
scientific-report.public.json
validation-attestation.json
package-manifest.json
README.txt
audit/generation-audit.json   # 可选，可整体删除
```

默认使用可移动离线目录包，而不是无限膨胀的单一 HTML。所有路径相对化，无远程字体、脚本、图标和分析服务。大报告自动拆分 annex 和搜索索引。

---

## 7. 三个领域包

### 7.1 湿实验

强制覆盖：

- 物种、细胞系、donor、样本、aliquot、well、pool 和 batch；
- RRID/目录号/批号、传代、鉴定、支原体；
- 构建体、序列版本/hash、引物、抗体、试剂和设备；
- biological/technical replicate、实验/观察/分析单位；
- 随机化、批次平衡、盲法、解盲、脱落和污染；
- 阳性/阴性/载体/假处理对照与 assay sensitivity；
- 有序 protocol 步骤、等待、温度、体积、偏差和校准；
- 成像参数、ROI 决策、处理历史和代表图选择；
- 检测限、MDE、区间、等效界和分析总体。

关键门禁：pool 不得被计成多个 biological N；正对照失败时零信号不能成为生物学反证。

### 7.2 AI/ML

强制覆盖：

- 数据快照、许可、split manifest 与 hash；
- donor/患者/序列簇/结构模板/轨迹等 group key；
- 原始材料到 dataset row 的 lineage；
- 标签来源、rater、盲法、一致性、争议裁决和标签不确定性；
- 去重、同源、批次、时间、预训练、结构和轨迹泄漏；
- 有状态预处理必须证明只在训练集拟合；
- baseline、架构、代码树、dirty patch、权重和预训练来源；
- 超参数空间、所有 trial、失败 trial、选择规则和 test access log；
- seed 派生、worker/rank、硬件和非确定性算子；
- 指标、区间、独立统计单位、亚组、校准和阈值；
- inference recipe 与 smoke test。

关键门禁：同一 donor 的 aliquot 不得跨 train/test；同一 MD 轨迹相邻帧不得随机拆分；共享标签或 checkpoint 的模型不得伪装为独立证据。

### 7.3 分子动力学

强制覆盖：

- 结构 accession、assembly、model、chain 和版本；
- 原始结构到模拟体系的残基/原子映射；
- altloc、缺失残基、突变、封端、二硫键和共价连接；
- 蛋白、核酸、脂质、糖、配体、金属和辅因子；
- pH、质子化方法、His 状态及不确定位点；
- 力场版本、文件 hash、电荷和 atom typing；
- 水、离子、组合规则、盒、PBC 和浓度；
- 最小化、NVT、NPT、限制释放、生产和增强采样；
- integrator、时间步、thermostat、barostat、constraints、cutoff 和 PME；
- replica、seed 树、checkpoint、restart 和 segment 链；
- PBC 处理、fit selection、frame range、stride 和 DataSlice；
- burn-in、相关时间、有效样本量、收敛标准和 replica 异质性。

关键门禁：一次运行在 60 ns 有结果、80 ns 崩溃并改参数重启时，完整历史必须保留；单一 RMSD 平台不能支持“已收敛”。

---

## 8. 验证体系

`rules/registry.yaml` 是规则的唯一权威来源，包含规则码、适用条件、严重度、JSON Pointer、是否可豁免和修复说明。Schema 只验证结构，语义验证器负责科学一致性。

首批核心规则：

- `COV001`：权威来源全集存在未处置源项；
- `COV002`：无权威全集却使用绝对完整性措辞；
- `WRK001`：completed 无完成标准或依据；
- `WRK002`：外部工作进入本项目完成计数；
- `WRK003`：成功重试覆盖失败 attempt；
- `TIM001`：无可信时序却标 prospective；
- `MAT001`：物质流或分析总体不闭合；
- `DER001`：定量主张缺派生闭包；
- `CLM001`：非背景主张无证据或前提；
- `BRG001`：跨域机制主张缺有效 bridge；
- `DEP001`：相依证据被重复计为独立；
- `CNF001`：真正冲突未登记或异质性被压扁；
- `NUL001`：对照/MDE 不足却把零结果作为反证；
- `NEG001`：已登记来源中的失败、零效应或排除未入账；
- `REV001`：更正/撤回未传播到下游主张；
- `REP001`：recipe、环境、随机状态或访问不足却抬高复现等级；
- `ATT001`：验证 attestation 与科学 payload hash 不匹配；
- `RED001`：秘密、受限值或绝对路径泄漏；
- `A11Y001`：核心阅读任务无法通过键盘或线性视图完成。

验证顺序：

```text
包与身份
→ Schema/缺失语义
→ 来源覆盖
→ ID/引用/图完整性
→ 执行状态与主体
→ 决策时序/物质流/分析总体
→ 数值派生闭包
→ 主张/证据/跨域桥/冲突
→ 更正与失效传播
→ 领域包
→ 访问/许可/复现
→ 脱敏/安全/离线/无障碍/打印
```

AI 审计单独验证，不阻断手工生成但科学上合规的报告。

---

## 9. 测试策略

### 9.1 必须具备的代表夹具

1. 权威来源登记 10 个运行、报告只处置 9 个；
2. 无权威全集，只能给受限完整性措辞；
3. 外部完成、本项目重分析和本项目新实验同时存在；
4. MD 中途失败、保留部分结果、改参数重启成功；
5. pooled sample 被错误计为多个 biological N；
6. donor aliquot 跨 train/test 泄漏；
7. 同一轨迹相邻帧随机拆分；
8. 阴性结果但正对照失败或 MDE 未知；
9. 相反方向来自不同时间点，应保留异质性；
10. 同一条件和 estimand 数值冲突，应进入 ConflictSet；
11. notebook 单元顺序或过滤改变，引发派生 hash 和主张失效；
12. MD 与湿实验构建体/序列/质子化条件不一致；
13. 上游工件撤回后，下游主张自动进入 review_required；
14. 修改科学字段后沿用旧 attestation，必须阻断；
15. 公开包中出现 secret、绝对路径、危险 URL 或路径穿越。

### 9.2 HTML 与人工测试

- 关闭 JavaScript 后全部科学内容仍可访问；
- `file://`、断网、移动目录后仍可打开；
- Chromium、Firefox、WebKit；
- 375/768/1280/1440 px，200%/400% 缩放；
- summary、full archive 和 filtered working copy 三种打印；
- 失败、反证、零效应、排除和撤回均可搜索；
- 研究者在 30 秒内识别已完成/计划、最强反证、最大 provenance 缺口和解决状态；
- 从关键结论到实际参数、失败 attempt 或工件最多三次操作；
- 键盘与 VoiceOver 完成率 100%。

---

## 10. 实施里程碑

### M0：冻结认识论与语义

交付：来源全集、完成主体、结果正交轴、决策时序、主张依赖图、跨域 bridge、复现单元、ID 和离线包 ADR。

### M1：作者输入与规范 Schema

交付：紧凑输入 schema、完整科学载荷 schema、缺失语义、章节适用性、三个领域包 smoke schema。

### M2：规则与验证器

交付：单一规则注册表、结构/引用/图/语义验证、单故障和对抗夹具、validation attestation。

### M3：来源覆盖与 R0–R2 复现闭环

交付：历史 invocation、recipe 差异、环境、随机状态、访问/许可、manifest、脱敏投影和 bundle verifier。

### M4：提示词包

交付：S1–S7 核心提示词、可选 S8 措辞提示词、三个领域 fragment、continuation 与提示注入测试。

### M5：离线 HTML 调度台

交付：确定性 renderer、主控制台、静态 annex、搜索/筛选、证据检查器、无 JS 路径、三种打印和大报告拆分。

### M6：MVP 集成试用

交付：湿实验、AI/ML、MD、跨域、失败重试、冲突和受限数据示例，以及三浏览器和研究者任务测试。

### M7：1.0 重跑验证

交付：预冻结 comparator、干净环境重跑、签名外部 attestation、scoped R3、migration 和领域专家签核。

---

## 11. MVP Definition of Done

MVP 必须同时满足：

1. HTML 仅由规范化公开科学 JSON 确定性生成；
2. 每份报告都有明确来源覆盖边界；
3. 计划、执行、推断、外部工作和未知严格分离；
4. 重试不覆盖失败历史；
5. 效应、统计判定、可解释性、失败和处置可同时表达；
6. 物质流、分析总体、定量派生和主张证据链可验证；
7. 跨域机制结论需要有效 CrossDomainBridge；
8. 阴性结果只有在 assay sensitivity 足够时才可解释；
9. recipe 与历史 invocation 不一致时不得宣称相应可重放等级；
10. 科学载荷改变后旧 attestation 自动失效；
11. 失败、反证、零效应、排除和撤回在 HTML、搜索、无 JS 和完整打印中均存在；
12. AI audit 可删除且删除前后科学内容、hash、验证和复现状态不变；
13. 离线包可移动并通过 `file://` 打开；
14. 公开包无秘密、受限值、绝对路径、远程依赖或活性危险内容；
15. 三领域和跨域示例通过全部阻断门；
16. 30 秒总览和三次以内下钻的人工任务测试达标。

---

## 12. 最重要的架构决定

这个项目防止“报告总是缺东西或误解任务”的关键不在文风，而在以下闭环：

```text
来源全集核对
  防止材料根本没有进入报告输入

章节适用性矩阵
  防止空字段和整类工作被静默省略

不可变 Attempt/Segment 历史
  防止成功重试覆盖失败

执行主体与状态分离
  防止计划、外部研究和推断冒充本项目完成

结果正交轴
  防止失败、阴性效应和排除互相覆盖

DataSlice 与派生闭包
  防止同一文件下的选择性分析不可追踪

Claim/Argument/Dependency/CrossDomainBridge
  防止证据重复计权和跨领域推理跳步

Revision 失效传播
  防止来源更正后旧结论继续显示有效

绑定 payload hash 的独立 attestation
  防止科学内容变化后沿用陈旧“验证通过”状态
```

因此，首个实现版本应优先完成一个**窄而完整的纵向切片**：紧凑输入 → 规范 JSON → 关键规则验证 → 一个湿实验/AI/MD 混合示例 → 离线 HTML。不要先堆积几十条提示词或追求复杂视觉效果；在事实源、缺失语义和验证门禁稳定之前，任何漂亮报告都仍然可能完整地展示错误信息。
