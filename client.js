/**
 * 全局系统提示词编辑器——浏览器半边。
 *
 * 做三件事：注入一张样式表、注册中英文字典、往 `settings.section` 这个列表插槽
 * 里注册一页设置页。插槽的 order 是 310：官方自带的设置页排在前面，「费用统计」
 * 是 300、「回合提示音」是 320，所以这一页正好落在「费用统计」下面。
 *
 * 页面只是宿主那半边的界面：打开时 GET 一次拿到此刻生效的文字，保存时 POST 回去。
 * 真正读写配置和落盘都是宿主半边的事。
 *
 * 模块格式说明：这个文件不是普通脚本，而是 DSH 客户端模块加载器认识的「懒工厂」
 * ——`window.__ModuleLoader__.load({ id, factory })`，id 必须等于包名。工厂被调用时
 * 用 `require('react')` 从平台模块表拿 React（不能自己装一份），返回 `{ inject, apply }`。
 */

window.__ModuleLoader__.load({
  id: 'dsh-prompt-editor',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** 插件自己的 id / 字典命名空间。 */
    const NS = 'dsh-prompt-editor'

    /** 宿主半边提供的路由。 */
    const ROUTE = '/prompt-editor/prompt'

    /** 页面用到的类名，统一加前缀，避免和宿主样式撞车。 */
    const CLASS = {
      page: 'dsh-prompt-editor',
      head: 'dsh-prompt-editor__head',
      title: 'dsh-prompt-editor__title',
      subtitle: 'dsh-prompt-editor__subtitle',
      card: 'dsh-prompt-editor__card',
      rowLabel: 'dsh-prompt-editor__rowLabel',
      rowHint: 'dsh-prompt-editor__rowHint',
      editor: 'dsh-prompt-editor__editor',
      actions: 'dsh-prompt-editor__actions',
      button: 'dsh-prompt-editor__button',
      notice: 'dsh-prompt-editor__notice',
      footnotes: 'dsh-prompt-editor__footnotes',
    }

    /** 只用主题变量（--dsw-alias-*），这样跟随客户的明暗主题与字号设置。 */
    const STYLES = `
.dsh-prompt-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}

.dsh-prompt-editor__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dsh-prompt-editor__title {
  color: var(--dsw-alias-label-primary);
  font-size: 15px;
  line-height: 22px;
  font-weight: 500;
}

.dsh-prompt-editor__subtitle {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.dsh-prompt-editor__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
}

.dsh-prompt-editor__rowLabel {
  color: var(--dsw-alias-label-primary);
}

.dsh-prompt-editor__rowHint {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}

.dsh-prompt-editor__editor {
  width: 100%;
  min-height: 260px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
  resize: vertical;
  box-sizing: border-box;
}

.dsh-prompt-editor__editor:focus {
  outline: none;
  border-color: var(--dsw-alias-border-l3);
}

.dsh-prompt-editor__editor:disabled {
  opacity: 0.6;
}

.dsh-prompt-editor__actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.dsh-prompt-editor__button {
  height: 28px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}

.dsh-prompt-editor__button:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
}

.dsh-prompt-editor__button:disabled {
  opacity: 0.45;
  cursor: default;
}

.dsh-prompt-editor__button[data-tone='primary'] {
  border-color: var(--dsw-alias-brand-primary, var(--dsw-alias-border-l3));
  color: var(--dsw-alias-label-primary);
}

.dsh-prompt-editor__button[data-tone='quiet'] {
  border-color: transparent;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-prompt-editor__notice {
  padding: 8px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}

.dsh-prompt-editor__notice[data-tone='error'] {
  color: var(--dsw-alias-label-primary);
}

.dsh-prompt-editor__footnotes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
`

    /** 中文文案。 */
    const zh = {
      nav: '全局系统提示词',
      title: '全局系统提示词',
      subtitle: '所有 agent 共用的自定义指令段。它插在系统提示词里：官方身份行之后、官方工具说明之前，对这个客户端的所有 agent（含子 agent）生效。',
      current: '当前自定义内容',
      currentHint: '下面是你保存的这段文字，它此刻正插在每个 agent 的系统提示词里。',
      editorHint: '可用变量：{{model}} 会换成当前模型名，{{cwd}} 会换成工作目录。写错的变量名会让提示词拼装失败，请只用这两个。',
      count: '{count} 个字符',
      save: '保存',
      fillDefault: '清空输入框',
      reload: '重新载入',
      dirty: '有未保存的修改',
      saved: '已保存。从下一轮对话开始生效。',
      failed: '保存失败：{message}',
      loading: '正在读取当前设置…',
      loadFailed: '读取失败：{message}',
      retry: '重试',
      custom: '这段文字正在生效，保存在：{document}',
      usingDefault: '当前没有自定义内容，所有 agent 都用官方默认提示词。',
      footnoteScope: '生效范围：这个客户端里所有 agent（含子 agent）的下一次请求。',
      footnoteSafe: '完整系统提示词由几段拼成：官方身份行 + 你这段文字 + 官方工具说明与环境信息 + 工具清单。这一页只改「你这段」，其余官方内容不受影响。',
    }

    /** English strings. */
    const en = {
      nav: 'Global system prompt',
      title: 'Global system prompt',
      subtitle: 'The custom instruction block every agent shares. It is inserted into the system prompt after the built-in identity line and before the built-in tool guidance, for every agent in this client (subagents included).',
      current: 'Your custom content',
      currentHint: 'This is the text you saved; it is in every agent\'s system prompt right now.',
      editorHint: 'Variables: {{model}} becomes the current model name, {{cwd}} the working directory. An unknown variable name breaks prompt assembly, so use only these two.',
      count: '{count} characters',
      save: 'Save',
      fillDefault: 'Clear the box',
      reload: 'Reload',
      dirty: 'Unsaved changes',
      saved: 'Saved. It takes effect from the next turn.',
      failed: 'Save failed: {message}',
      loading: 'Reading the current setting…',
      loadFailed: 'Could not read the setting: {message}',
      retry: 'Retry',
      custom: 'This text is in effect, stored in: {document}',
      usingDefault: 'Nothing is customized; every agent uses the built-in prompt.',
      footnoteScope: 'Scope: the next request of every agent in this client, including subagents.',
      footnoteSafe: 'The complete system prompt is assembled from several parts: the built-in identity line + this text + the built-in capability and environment sections + the tool schemas. This page edits only your part; the rest is untouched.',
    }

    /**
     * 填入 `{name}` 形式的变量。
     * @param template - 含占位符的文案。
     * @param vars - 变量表。
     * @returns 替换后的文案。
     */
    function interpolate(template, vars) {
      if (vars === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
      ))
    }

    /**
     * 取翻译函数：优先用插槽座位给的（已绑定本插件命名空间），
     * 它答不出来时退回自带的中文字典。
     * @param seat - 插槽传给组件的 props。
     * @returns 翻译函数。
     */
    function translatorOf(seat) {
      const bound = seat?.t
      if (typeof bound !== 'function') return (key, vars) => interpolate(zh[key] ?? key, vars)
      return (key, vars) => {
        const answered = bound(key, vars)
        if (answered !== undefined && answered !== key) return answered
        return interpolate(zh[key] ?? key, vars)
      }
    }

    /**
     * 请求宿主路由并解析 JSON。
     * @param init - fetch 参数。
     * @returns 解析后的响应体。
     * @throws Error 当响应不是 2xx。
     */
    async function request(init) {
      const response = await fetch(ROUTE, { credentials: 'same-origin', ...init })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${String(response.status)}`)
      return payload
    }

    /**
     * 设置页面本体。
     * @param seat - 插槽座位（带本插件命名空间的翻译函数）。
     * @returns 页面元素。
     */
    function PromptEditorPage(seat) {
      const t = translatorOf(seat)
      const [state, setState] = React.useState({ status: 'loading' })
      const [text, setText] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [notice, setNotice] = React.useState(undefined)

      const load = React.useCallback(() => {
        setState({ status: 'loading' })
        setNotice(undefined)
        request({ method: 'GET' })
          .then((payload) => {
            setState({ status: 'ready', payload })
            setText(payload.value)
          })
          .catch((error) => { setState({ status: 'error', error: String(error.message ?? error) }) })
      }, [])

      React.useEffect(() => { load() }, [load])

      const save = React.useCallback((next) => {
        setBusy(true)
        setNotice(undefined)
        request({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: next }),
        })
          .then((payload) => {
            setState({ status: 'ready', payload })
            setText(payload.value)
            setNotice({ tone: 'ok', text: t('saved') })
          })
          .catch((error) => {
            setNotice({ tone: 'error', text: t('failed', { message: String(error.message ?? error) }) })
          })
          .finally(() => { setBusy(false) })
      }, [t])

      const head = h('div', { className: CLASS.head },
        h('div', { className: CLASS.title }, t('title')),
        h('div', { className: CLASS.subtitle }, t('subtitle')),
      )

      if (state.status === 'loading') {
        return h('div', { className: CLASS.page },
          head,
          h('div', { className: CLASS.notice }, t('loading')),
        )
      }

      if (state.status === 'error') {
        return h('div', { className: CLASS.page },
          head,
          h('div', { className: CLASS.notice, 'data-tone': 'error' }, t('loadFailed', { message: state.error })),
          h('div', { className: CLASS.actions },
            h('button', { type: 'button', className: CLASS.button, onClick: load }, t('retry')),
          ),
        )
      }

      const payload = state.payload
      const dirty = text !== payload.value

      return h('div', { className: CLASS.page },
        head,

        h('div', { className: CLASS.card },
          h('div', { className: CLASS.rowLabel }, t('current')),
          h('div', { className: CLASS.rowHint }, t('currentHint')),
          h('textarea', {
            className: CLASS.editor,
            value: text,
            spellCheck: false,
            disabled: busy,
            onChange: (event) => { setText(event.target.value) },
          }),
          h('div', { className: CLASS.rowHint },
            t('editorHint'),
            ' ',
            t('count', { count: text.length }),
            dirty ? ` · ${t('dirty')}` : '',
          ),
          h('div', { className: CLASS.actions },
            h('button', {
              type: 'button',
              className: CLASS.button,
              'data-tone': 'primary',
              disabled: busy || !dirty,
              onClick: () => { save(text) },
            }, t('save')),
            h('button', {
              type: 'button',
              className: CLASS.button,
              disabled: busy,
              // 只填输入框、不写入：写入永远只发生在「保存」，所以一次误点抹不掉自定义内容。
              onClick: () => {
                setText('')
                setNotice(undefined)
              },
            }, t('fillDefault')),
            h('button', {
              type: 'button',
              className: CLASS.button,
              'data-tone': 'quiet',
              disabled: busy,
              onClick: () => { load() },
            }, t('reload')),
          ),
        ),

        notice !== undefined && h('div', { className: CLASS.notice, 'data-tone': notice.tone }, notice.text),

        h('div', { className: CLASS.footnotes },
          h('span', null, payload.configured ? t('custom', { document: payload.document }) : t('usingDefault')),
          h('span', null, t('footnoteScope')),
          h('span', null, t('footnoteSafe')),
        ),
      )
    }

    /**
     * 插入一次样式表。
     * @returns 移除样式表的清理函数。
     */
    function installStyles() {
      const existing = document.querySelector(`style[data-plugin="${NS}"]`)
      if (existing !== null) return () => {}
      const tag = document.createElement('style')
      tag.dataset.plugin = NS
      tag.textContent = STYLES
      document.head.appendChild(tag)
      return () => { tag.remove() }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => installStyles(), `${NS}: styles`)

        // 字典是增强项：没有 locale 服务的宿主也要能渲染这一页。
        const locale = ctx.get?.('locale')
        if (locale !== undefined) {
          ctx.effect(() => locale.register(NS, { zh, en }), `${NS}: dictionaries`)
        }
        let activeLocale = locale?.getSnapshot?.().active
        ctx.on?.('locale/change', (snapshot) => {
          activeLocale = snapshot?.active ?? activeLocale
        })

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'prompt-editor',
          // 300 是「费用统计」，320 是「回合提示音」，所以 310 正好排在费用统计下面。
          order: 310,
          label: () => (activeLocale !== undefined && !activeLocale.startsWith('zh') ? en.nav : zh.nav),
          locale: NS,
        }, PromptEditorPage))
      },
    }
  },
})
