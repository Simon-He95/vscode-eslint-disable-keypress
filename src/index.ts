import { createCompletionItem, createPosition, nextTick, saveFile, getCurrentFileUrl, getLineText, getOffsetFromPosition, getPosition, getSelection, jumpToLine, message, registerCommand, registerCompletionItemProvider, updateText, getRootPath } from '@vscode-use/utils'
import type { Disposable, ExtensionContext } from 'vscode'
import { options } from './constants'
import { jsShell } from 'lazy-js-utils'


export async function activate(context: ExtensionContext) {
  const disposes: Disposable[] = []

  const isBlock = (text: string) => {
    const textArr = text.split('\n')
    if (textArr.length >= 2)
      return true
    if (textArr[1] && textArr[1].trim())
      return true
    return false
  }
  let isWorking = false
  disposes.push(registerCommand('vscode-eslint-disable-keypress.on', async () => {
    if (isWorking)
      return

    const selection = getSelection()
    if (!selection)
      return

    let insetText = ''
    const errors = []
    isWorking = true

    const { result } = jsShell(`npx eslint ${getCurrentFileUrl()}`, {
      cwd: getRootPath(),
      isLog: true,
      stdio: 'pipe'
    })

    if (result) {
      const data = result.split('\n').map(i => i.trim().replace(/\s+/g, ' ')).slice(1)
      for (const error of data) {
        if (!error)
          break
        const [pos, e, ...rest] = error.split(' ')
        const msg = rest.slice(0, -1).join(' ')
        const rule = rest.slice(-1)[0]
        const [line, character] = pos.split(':').map(i => +i)
        errors.push({
          line,
          character,
          msg,
          rule
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
      if (!errors.length)
        insetText = '/* eslint-disable  */\n'
      else {
        const temp = []
        for (const item of errors) {
          const { line, rule } = item
          if (line >= startPosition.line + 1 && line <= newEndPosition.line + 1) {
            temp.push(rule)
          } else if (line > newEndPosition.line + 1)
            break
        }
        insetText = `/* eslint-disable ${temp.join(',')} */\n`
      }
      updateText((edit) => {
        edit.insert(startPosition, insetText)
        edit.insert(createPosition(newEndPosition.line + 1, 0), '/* eslint-enable */\n')
      })
      nextTick(() => {
        jumpToLine([selection.line, insetText.length - 4])
      })
    }
    else {
      if (selection.line === 0) {
        // /* eslint-disable */ 将整个文件禁用eslint
        insetText = '// eslint-disable\n'
        updateText((edit) => {
          edit.insert(createPosition(0, 0), insetText)
        })
      }
      else {
        // 下一行eslint eslint-disable-next-line
        if (!errors.length)
          insetText = '// eslint-disable-next-line\n'
        else {
          const temp = []
          for (const item of errors) {
            const { line, rule } = item
            if (line === selection.line + 1) {
              temp.push(rule)
            } else if (line > selection.line + 1)
              break
          }
          insetText = `// eslint-disable-next-line ${temp.join(',')}\n`
        }

        updateText((edit) => {
          edit.insert(createPosition(selection.line, 0), insetText)
        })
        nextTick(() => {
          jumpToLine([selection.line, insetText.length])
        })
      }
    }
    saveFile()
    isWorking = false
  }))

  disposes.push(registerCompletionItemProvider('*', () => {
    const selection = getSelection()
    if (!selection)
      return
    const lineText = getLineText(selection.line)
    if (!lineText)
      return
    if (!lineText.startsWith('//') && !lineText.startsWith('/*'))
      return

    return options.map(content => createCompletionItem({
      content,
    }))
  }, [' ']))

  context.subscriptions.push(...disposes)
}

export function deactivate() {

}
