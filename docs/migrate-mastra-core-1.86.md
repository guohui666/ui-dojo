# 迁移计划：@mastra/core 1.50.0 → 1.86.0

这个文件记录 ui-dojo 从 `@mastra/core` 1.50.0 升到 1.86.0 的 trial 结果。
trial 在分支 `guohui666/upgrade-core-1.86` 上完成。
按这个文件可以独立完成真正的升级。

## 1. 目标版本

2026-11-27 用 `npm view <pkg> dist-tags.latest` 确认。全部是 stable，没有 `-alpha`。

| 包 | 现在 | 目标 | peer 要求 |
| --- | --- | --- | --- |
| `@mastra/core` | 1.50.0 | 1.86.0 | `zod ^3.25.0 \|\| ^4.0.0`，Node `>=22.13.0` |
| `@mastra/ai-sdk` | 1.6.1 | 1.12.1 | `@mastra/core >=1.83.0 <2` |
| `@mastra/client-js` | 1.31.0 | 1.62.0 | `zod ^3.25.0 \|\| ^4.0.0` |
| `@mastra/libsql` | 1.15.1 | 1.32.0 | `@mastra/core >=1.86.0 <2` |
| `@mastra/loggers` | 1.2.0 | 1.3.12 | `@mastra/core >=1.0.0 <2` |
| `@mastra/memory` | 1.22.1 | 1.41.3 | `@mastra/core >=1.85.1 <2` |
| `@mastra/observability` | 1.16.0 | 1.24.3 | `@mastra/core >=1.16.0 <2` |
| `@mastra/react` | 0.2.25 | 1.16.0 | `@mastra/core >=1.67.0 <2`，`react >=19` |
| `mastra`（CLI） | 1.18.1 | 1.40.2 | `@mastra/core >=1.85.1 <2` |

`ai` 和 `zod` 不需要升。
`@mastra/core` 1.86.0 的 `zod` peer 是 `^3.25.0 || ^4.0.0`。现在的 `zod ^4.3.6` 满足。
`ai` 的 `latest` 是 7.0.183。但 `chat@4.45.0`（`@mastra/core` 的依赖）的 peer 是 `ai ^6.0.182 || ^7.0.0`。
现在的 `ai ^5.0.112` 解析到 5.0.179，只有 peer warning，没有运行时错误。
`@assistant-ui/react-ai-sdk@1.1.16` 依赖 `ai ^5`。升到 `ai@7` 会破坏它。
所以这次不升 `ai`。

## 2. 影响这个 app 的 breaking change

### 2.1 `@mastra/react` 0.5.0 删掉了 AI SDK 桥接

`@mastra/react` 0.5.0（2026-06-03，commit `43dd577`）删掉了这些 export：

- `toAssistantUIMessage`
- `MastraUIMessage`
- `useChat` 的旧签名（返回 `MastraUIMessage[]`）

新的 `useChat` 返回 `MastraDBMessage[]`。它走 agent signal 路径，不走 AI SDK 的 `UIMessage`。

`src/pages/assistant-ui/index.tsx` 用了这三个 export。改成用 `@assistant-ui/react-ai-sdk` 的 `useChatRuntime`，走 `chatRoute()`。

旧代码：

```tsx
import { toAssistantUIMessage, useChat, type MastraUIMessage } from "@mastra/react";

const { messages, sendMessage, cancelRun, isRunning, setMessages } = useChat({
  agentId,
  initialMessages: initialMessages || [],
});

await sendMessage({ message: input, mode: "stream", threadId, signal });
```

新代码：

```tsx
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";

const runtime = useChatRuntime({
  transport: new AssistantChatTransport({
    api: `${MASTRA_BASE_URL}/chat/${agentId}`,
    body: threadId ? { memory: { resource: agentId, thread: threadId } } : undefined,
  }),
  messages: initialMessages,
  onFinish: () => { void refreshThreadList?.(); },
});
```

`toAISdkV5Messages` 从 `@mastra/ai-sdk/ui` 导入，还在。历史消息转换继续用它。

### 2.2 `@mastra/core` 1.68.0 加了 `canceled` step status

`WorkflowStepStatus` 加了 `"canceled"`。
`src/pages/ai-sdk/network.tsx` 和 `src/pages/ai-sdk/workflow-suspend-resume.tsx` 的 `STATUS_MAP` 是 `Record<StepStatus, ...>`。
TypeScript 报 `Property 'canceled' is missing`。

两个文件都加了 `canceled: "output-error"`。

### 2.3 `@mastra/core` 1.83.0 改了 `durable` 的含义

`Agent` 的 `durable` 选项现在只控制 resumable stream，不控制 checkpoint。
这个 app 的 agent 没有设 `durable`。默认行为不变：注册在 `Mastra` 上的 agent 有 resumable stream，standalone agent 没有。
不需要改代码。

### 2.4 `patches/mastra@1.18.1.patch` 不再需要

这个 patch 修的是 CLI 1.18.1 在 `getResolvedVersion` 里把 `ENOTDIR` 打到 `console.error` 的问题。
CLI 1.40.2 的 `getResolvedVersion` 已经用 try/catch 包住了。`mastra build` 日志里没有 `ENOTDIR`。
删掉 `patches/` 目录和 `package.json` 里的 `pnpm.patchedDependencies`。

### 2.5 `@mastra/ai-sdk` 1.12.0 的 `chatRoute` 加了 `resumable`

`chatRoute({ resumable: true })` 返回 `[postRoute, reconnectRoute]` 数组。
这个 app 没有用 `resumable`。`chatRoute` 的默认返回值还是单个 route。不需要改。

## 3. trial 改了什么

### 3.1 依赖

`package.json` 里 9 个包升到目标版本。`pnpm-lock.yaml` 重新生成。
`patches/mastra@1.18.1.patch` 删除。

### 3.2 代码

- `src/pages/assistant-ui/index.tsx`：换掉 `@mastra/react` 的 AI SDK 桥接，改用 `useChatRuntime`。
- `src/pages/ai-sdk/network.tsx`：`STATUS_MAP` 加 `canceled`。
- `src/pages/ai-sdk/workflow-suspend-resume.tsx`：`STATUS_MAP` 加 `canceled`。

### 3.3 检查结果

| 检查 | baseline | trial |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | pass | pass |
| `pnpm run lint` | pass | pass |
| `pnpm run vite:build` | pass | pass |
| `pnpm run mastra:build` | pass | pass（用 pnpm 10.18.2） |

`mastra:build` 在 pnpm 12.6.0 下失败。原因见第 4 节。

## 4. 没有做的事

### 4.1 pnpm 12 的 `minimumReleaseAge` 阻断 build

`mastra build` 内部跑 `pnpm install`。
pnpm 12 默认有 `minimumReleaseAge`（24 小时）。
`hono@4.13.23`、`js-tokens@10.0.2`、`lucide-react@1.82.0` 都在 24 小时内发布。
pnpm 12 拒绝安装，build 失败，报 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`。

pnpm 10.18.2 没有这个限制。CI 用 `pnpm/action-setup@v4`，读 `packageManager` 字段，用 pnpm 10.18.2。
本地如果 `pnpm` 在 PATH 上是 12.x，build 会失败。

解决办法：build 前用 `npx pnpm@10.18.2` 把 pnpm 10 放到 PATH 前面。
或者等 24 小时后再 build。

### 4.2 `/network` 路由在 baseline 和 trial 都返回 500

`routingAgent` 没有配 `Memory`。
`@mastra/core` 1.50.0 和 1.86.0 的 `networkLoop` 都检查 memory。
没有 memory 就抛 `AGENT_NETWORK_MEMORY_REQUIRED`。
这不是升级引入的。`src/pages/ai-sdk/network.tsx` 的页面在 baseline 下也不能正常工作。

要修的话，给 `routingAgent` 加 `memory: new Memory({ storage: getStorage() })`。
这是产品决定，不在这次升级范围内。

### 4.3 模型 key 缺失，chat 路由返回 error stream

所有 agent 用 `anthropic/zhipu-glm/glm-5.3-flash`。
没有 `ANTHROPIC_API_KEY` 时，`/chat/:agentId` 返回 SSE error：
`Could not find API key process.env.ANTHROPIC_API_KEY`。
baseline 和 trial 行为一样。不是升级引入的。

### 4.4 `ai` 版本的 peer warning

`chat@4.45.0` 的 peer 是 `ai ^6.0.182 || ^7.0.0`。现在解析到 `ai@5.0.179`。
pnpm 报 warning，但没有运行时错误。
`@assistant-ui/react-ai-sdk@1.1.16` 依赖 `ai ^5`。升 `ai` 到 6 或 7 需要同时升 `@assistant-ui/react-ai-sdk`。
这是单独的决定，不在这次升级范围内。

## 5. 手动验证清单

每个页面用浏览器打开，确认没有 React 白屏。
需要模型 key 的页面，确认 error 是 "Could not find API key"，不是 500 或白屏。

| 页面 | 路径 | 验证 |
| --- | --- | --- |
| AI SDK Chat | `/` | 页面渲染，发消息后看到 error stream |
| AI SDK Client Tools | `/ai-sdk/client-tools` | 页面渲染，两个 suggestion 按钮可见 |
| AI SDK Workflow Basic | `/ai-sdk/workflow` | 页面渲染 |
| AI SDK Workflow Streaming | `/ai-sdk/workflow-agent-text-stream` | 页面渲染 |
| AI SDK Workflow Suspend/Resume | `/ai-sdk/workflow-suspend-resume` | 填表提交，看到 "Awaiting Approval"，点 Approve 后看到 "finalized successfully" |
| AI SDK Workflow Branching | `/ai-sdk/workflow-custom-events` | 页面渲染 |
| AI SDK Network | `/ai-sdk/network` | 页面渲染。发消息返回 500（baseline 也是，见 4.2） |
| AI SDK Network Events | `/ai-sdk/agent-network-custom-events` | 页面渲染 |
| AI SDK Generative UI | `/ai-sdk/generative-user-interfaces` | 页面渲染 |
| AI SDK Tool Events | `/ai-sdk/generative-user-interfaces-with-custom-events` | 页面渲染 |
| AI SDK Nested Streams | `/ai-sdk/tool-nested-streams` | 页面渲染 |
| AI SDK Tool Approval | `/ai-sdk/tool-approval` | 页面渲染 |
| AI SDK JSON Render | `/ai-sdk/json-render` | 页面渲染 |
| Assistant UI Chat | `/assistant-ui/ghibliAgent/chat/:threadId` | 页面渲染，发消息后看到 error stream，thread 列表可见 |
| Assistant UI Client Tools | `/assistant-ui/client-tools` | 页面渲染 |
| Assistant UI HITL | `/assistant-ui/human-in-the-loop` | 页面渲染 |
| CopilotKit Chat | `/copilot-kit` | 页面渲染，两个 suggestion 可见 |
| CopilotKit 其他页面 | `/copilot-kit/*` | 每个页面渲染，没有白屏 |
| Mastra Client SDK Chat | `/mastra-client-sdk/chat` | 页面渲染，三个 suggestion 可见 |
| Mastra Client SDK JSON Render | `/mastra-client-sdk/json-render` | 页面渲染 |

## 6. 上线步骤

1. 在 `guohui666/upgrade-core-1.86` 上 review 这个 PR。
2. 确认 `pnpm run lint`、`pnpm run vite:build`、`pnpm run mastra:build` 都 pass。
3. `mastra:build` 必须用 pnpm 10.18.2。CI 自动用这个版本。本地用 `npx pnpm@10.18.2 run mastra:build`。
4. Merge 到 `fork/main`。`origin` 是上游，不要 push。
5. Push 到 `fork/main` 会触发 `.github/workflows/deploy.yml`，自动跑 `pnpm mastra deploy`。
6. 部署后打开 `https://ui-dojo.mastra.ai/`，按第 5 节的清单检查。

## 7. 回滚

如果部署后出问题：

1. `git revert` 升级的 commit。
2. Push 到 `fork/main`。CI 会重新部署旧版本。
3. 旧版本的 `patches/mastra@1.18.1.patch` 会恢复。`pnpm install --frozen-lockfile` 能过。

## 8. 风险

- **pnpm 12 的 `minimumReleaseAge`**。如果 CI 的 `pnpm/action-setup` 升级到 pnpm 12，build 会失败。现在 `packageManager` 锁在 `pnpm@10.18.2`，CI 不会自动升。
- **`/network` 500**。这是 baseline 就有的。升级不会让它变好或变坏。如果要修，给 `routingAgent` 加 `Memory`。
- **`ai` peer warning**。`chat@4.45.0` 要 `ai ^6 || ^7`，现在是 `ai@5`。没有运行时错误，但未来 `@mastra/core` 可能收紧这个 peer。
- **模型 key**。所有 agent 用 `anthropic/zhipu-glm/glm-5.3-flash`。没有 `ANTHROPIC_API_KEY` 时 chat 路由返回 error stream。这是 baseline 行为，不是升级引入的。
- **数据库迁移**。`@mastra/libsql` 1.32.0 在打开旧数据库时自动加了 5 张表（`mastra_memory_run_fences`、`mastra_workflow_definitions`、`mastra_workflow_run_entries`、`mastra_workflow_run_owners`、`mastra_workflow_runs`）。旧数据（thread、message、workflow snapshot）保持不变。用旧数据库启动新服务器，thread 和 message 都能读到。
- **`durable` 语义变化**。`@mastra/core` 1.83.0 改了 `durable` 的含义。这个 app 没有用 `durable`，不受影响。如果以后加 durable agent，要用 `createDurableAgent`，不能再靠 `durable: true`。
