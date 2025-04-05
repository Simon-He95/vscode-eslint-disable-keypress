import { createExtension, createFakeProgress, createPosition, getCurrentFileUrl, getLineText, getOffsetFromPosition, getPosition, getRootPath, getSelection, insertText as insertSnippetText, message, nextTick, registerCommand, saveFile } from '@vscode-use/utils'
import { jsShell } from 'lazy-js-utils/node'

// eslint-disable-next-line no-restricted-syntax
export = createExtension(() => {
  const isBlock = (text: string) => {
    const textArr = text.split('\n')
    if (textArr.length >= 2)
      return true
    if (textArr[1] && textArr[1].trim())
      return true
    return false
  }
  let isWorking = false

  return [
    registerCommand('vscode-eslint-disable-keypress.on', async () => {
      if (isWorking)
        return
      const selection = getSelection()
      if (!selection)
        return

      let insertText = ''
      const errors: any[] = []
      isWorking = true

      saveFile()
      nextTick(async () => {
        let resolve!: () => void
        let reject!: (msg: string) => void
        createFakeProgress({
          title: 'Progress Bar: vscode-eslint-disable-keypress',
          callback(_resolve, _reject) {
            resolve = _resolve
            reject = _reject
          },
        })
        try {
          const { result } = await jsShell(`npx eslint ${getCurrentFileUrl()}`, {
            cwd: getRootPath(),
            isLog: true,
            stdio: 'pipe',
            errorExit: false,
          })
          resolve()

          if (result) {
            const data = result.split('\n').map((i: any) => i.trim().replace(/\s+/g, ' ')).filter((item: any) => /^\d/.test(item))
            for (const error of data) {
              if (!error)
                break
              const [pos, _, ...rest] = error.split(' ')
              const msg = rest.slice(0, -1).join(' ')
              const rule = rest.slice(-1)[0]
              const [line, character] = pos.split(':').map((i: any) => +i)
              errors.push({
                line,
                character,
                msg,
                rule,
              })
            }
          }
          if (selection.selectedTextArray.length > 1) {
            // /* eslint-disable */  /* eslint-enable */
            // todo: 多个选择快触发
          }
          else if (isBlock(selection.selectedTextArray[0])) {
            const offset = getOffsetFromPosition(createPosition(selection.line, selection.character))!
            const newEndPosition = getPosition(offset + selection.selectedTextArray[0].length)
            const startPosition = createPosition(selection.line, 0)
            if (!errors.length) {
              isWorking = false
              return message.warn('当前行没有eslint错误')
            }

            const temp = []
            for (const item of errors) {
              const { line, rule } = item
              if (line >= startPosition.line + 1 && line <= newEndPosition.line + 1)
                temp.push(rule)
              else if (line > newEndPosition.line + 1)
                break
            }
            const nextLineText = getLineText(selection.line)
            const match = nextLineText?.match(/^\s+/)
            const _offset = match ? match[0].length : 0
            const space = ' '.repeat(_offset)
            insertText = `${space}/* eslint-disable \${1:${temp.join(',')}} */\n`
            await insertSnippetText(createPosition(newEndPosition.line + 1, 0), `${space}/* eslint-enable */\n`)
            await insertSnippetText(startPosition, insertText)
          }
          else {
            if (selection.line === 0 && !errors.length) {
              // /* eslint-disable */ 将整个文件禁用eslint
              insertText = '// eslint-disable\n'
              await insertSnippetText(createPosition(0, 0), insertText)
            }
            else {
              // 下一行eslint eslint-disable-next-line
              if (!errors.length) {
                message.warn('当前行没有eslint错误')
                isWorking = false
                return
              }

              const temp = []
              for (const item of errors) {
                const { line, rule } = item
                if (line === selection.line + 1)
                  temp.push(rule)
                else if (line > selection.line + 1)
                  break
              }
              insertText = `// eslint-disable-next-line ${temp.join(',')}\n`

              const nextLineText = getLineText(selection.line)
              const match = nextLineText?.match(/^\s+/)
              const offset = match ? match[0].length : 0
              const space = ' '.repeat(offset)
              await insertSnippetText(createPosition(selection.line, 0), space + insertText)
            }
          }
          isWorking = false
        }
        catch (e: any) {
          reject(e)
          isWorking = false
        }
      })
    }),
  ]
})
