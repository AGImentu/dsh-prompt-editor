/**
 * 全局系统提示词编辑器——宿主半边（Node 侧）。
 *
 * 它做两件事：
 *   1. 把用户保存的这段文字，注册成系统提示词里的一个**全局段落**；
 *   2. 提供一个 HTTP 路由，让设置页面读它、写它。
 *
 * ## 为什么不去改 dsh-system-prompt 的 personaPrefix
 *
 * 那是最直觉的做法，但它不生效。原因是 DSH 的「Agent 预设」机制：默认预设
 * （`dsh-web-app/presets/*.patch.yml` 里的 `cordis`）会为每个 agent 挂一行
 * `@deepseek-ai/dsh-persona`，而它注册的段落名和部署级人设是**同名**的——
 * dsh-persona 的文档写得很明白：作用域内的段落是「遮蔽」部署级默认值，而不是
 * 排在它旁边。于是写进 personaPrefix 的文字，配置里读得到、模型却看不到。
 *
 * 本插件改成注册**自己名字的段落**（`prompt-editor:global-instructions`）。
 * 名字独一无二，任何预设都顶不掉它，所以它对所有 agent（含子 agent）都生效。
 * order 取 10：紧跟官方身份行（-1000）与人设前缀（0）之后，排在第一方工具说明
 * （500 起）之前。
 *
 * ## 为什么写配置走官方的 configEditor 服务
 *
 * 它替我们做了所有容易出错的事：写入前按 schema 校验、原子替换（不会留下半个
 * 文件）、保留文件里的注释、写完由 Loader / HMR 立即重组、以及「被更高层覆盖时
 * 拒绝写入」，而不是写进一个永远不生效的文件。
 *
 * @module dsh-prompt-editor
 */

/** 依赖的服务：webServer 提供路由，systemPrompt 收段落，configEditor 落盘配置。 */
export const inject = ['webServer', 'systemPrompt', 'configEditor']

/** 本插件自己的 Loader 行 id（也是配置文件里的覆盖目标 id）。 */
const ROW_ID = 'prompt-editor'

/** 本插件自己的 HTTP 路由。 */
const ROUTE = '/prompt-editor/prompt'

/** 段落名：独一无二，避免被 preset 的同名段落遮蔽。 */
const SECTION_NAME = 'prompt-editor:global-instructions'

/** 段落排序：10 = 官方人设前缀（0）之后、第一方工具说明（500 起）之前。 */
const SECTION_ORDER = 10

/** 一段提示词的字符数上限：挡住误粘贴一个超大文件把进程撑爆。 */
const MAX_CHARS = 131072

/** 请求体上限（UTF-8 下一个中文字符最多 4 字节，再留一点 JSON 包装的余量）。 */
const MAX_BODY_BYTES = MAX_CHARS * 4 + 4096

const OK = 200
const BAD_REQUEST = 400
const NOT_FOUND = 404
const CONFLICT = 409
const SERVER_ERROR = 500

/** 一个能转成 HTTP 状态码 + 可读文案的拒绝理由。 */
class RouteError extends Error {
  /**
   * @param status - 要返回的 HTTP 状态码。
   * @param message - 给用户看的原因，会显示在设置页面上。
   */
  constructor(status, message) {
    super(message)
    this.status = status
    this.name = 'RouteError'
  }
}

/**
 * 从一行配置里取出本插件的文本。
 * @param config - 该行的 config 对象。
 * @returns 文本；缺失时为空串。
 */
function textOf(config) {
  return typeof config?.text === 'string' ? config.text : ''
}

/**
 * 找到本插件这一行。
 * @param ctx - 宿主上下文。
 * @returns 该行的 Loader 条目。
 * @throws RouteError 404 当组合里没有这一行。
 */
function entryOf(ctx) {
  const entry = ctx.configEditor.entries().find((row) => row.options.id === ROW_ID)
  if (entry === undefined) throw new RouteError(NOT_FOUND, `当前组合里找不到 "${ROW_ID}" 这一行`)
  return entry
}

/**
 * 组装一份「当前状态」响应。
 * @param ctx - 宿主上下文。
 * @returns 给页面的状态对象。
 */
function snapshotOf(ctx) {
  const value = textOf(entryOf(ctx).options.config)
  return {
    rowId: ROW_ID,
    value,
    configured: value !== '',
    document: ctx.configEditor.documentPath,
  }
}

/**
 * 读取并解析请求体，带硬上限。
 * @param req - 原始 Node 请求。
 * @returns 请求体字符串。
 * @throws RouteError 400 当请求体过大。
 */
async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new RouteError(BAD_REQUEST, '提交的内容太大')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** 用 JSON 作答。 */
function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/** 用状态码作答、不带内容。 */
function sendStatus(res, status) {
  res.statusCode = status
  res.end()
}

/**
 * 处理一次请求。
 * @param ctx - 宿主上下文。
 * @param req - 原始 Node 请求。
 * @param res - 原始 Node 响应。
 * @returns 处理完成后的 Promise。
 */
async function handle(ctx, req, res) {
  const method = (req.method ?? 'GET').toUpperCase()

  if (method === 'GET') {
    sendJson(res, OK, snapshotOf(ctx))
    return
  }

  if (method === 'POST') {
    const body = await readBody(req)
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch {
      throw new RouteError(BAD_REQUEST, '提交的内容不是合法 JSON')
    }
    const value = parsed?.value
    if (typeof value !== 'string') throw new RouteError(BAD_REQUEST, 'value 必须是字符串')
    if (value.length > MAX_CHARS) throw new RouteError(BAD_REQUEST, `内容太长（上限 ${MAX_CHARS} 个字符）`)

    const entry = entryOf(ctx)
    try {
      await ctx.configEditor.edit(entry, (current) => {
        // 只拷有值的字段：把 undefined 漏进 YAML 会写成 null，schema 会拒绝整行。
        const next = {}
        for (const [key, field] of Object.entries(current ?? {})) {
          if (field !== undefined) next[key] = field
        }
        // 清空等于「不要这段自定义」：删掉这个键，覆盖项就会被 configEditor 移除。
        if (value === '') delete next.text
        else next.text = value
        return next
      })
    } catch (error) {
      throw new RouteError(CONFLICT, error instanceof Error ? error.message : String(error))
    }

    // 保存后这一行会被重组，条目对象可能已经换了，所以重新找一次。
    sendJson(res, OK, snapshotOf(ctx))
    return
  }

  sendStatus(res, 405)
}

/**
 * 挂上提示词段落与路由。
 * @param ctx - 宿主上下文。
 * @param config - 本行的 config（来自 profile patch 的覆盖，或空对象）。
 * @returns 无。
 */
export function apply(ctx, config) {
  const text = textOf(config)

  // 空文本不注册：空段落本来也会在渲染时消失，不注册更省事。
  if (text !== '') {
    ctx.effect(() => ctx.systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text,
    }), 'prompt-editor: prompt section')
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: (req, res) => {
      handle(ctx, req, res).catch((error) => {
        const status = error instanceof RouteError ? error.status : SERVER_ERROR
        const message = error instanceof Error ? error.message : String(error)
        ctx.logger?.warn(error)
        try {
          sendJson(res, status, { error: message })
        } catch {
          // 响应可能已经发出去了，没有别的可做。
        }
      })
    },
  }), 'prompt-editor: route')
}
