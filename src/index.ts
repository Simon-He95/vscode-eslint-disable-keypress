import { createCompletionItem, createPosition, createProgress, getCurrentFileUrl, getLineText, getOffsetFromPosition, getPosition, getRootPath, getSelection, jumpToLine, message, nextTick, registerCommand, registerCompletionItemProvider, saveFile, updateText } from '@vscode-use/utils'
import type { Disposable, ExtensionContext } from 'vscode'
import { jsShell } from 'lazy-js-utils'
import { options } from './constants'

export async function activate(context: ExtensionContext) {
  const disposes: Disposable[] = []
  let resolver: any
  let isPending = true
  let timer: any
  const p = (cb: any) => new Promise((resolve) => {
    cb()
    resolver = resolve
  })

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

    let insertText = ''
    const errors: any[] = []
    isWorking = true

    saveFile()
    nextTick(() => {
      const { result } = jsShell(`npx eslint ${getCurrentFileUrl()}`, {
        cwd: getRootPath(),
        isLog: true,
        stdio: 'pipe',
      })

      if (result) {
        const data = result.split('\n').map(i => i.trim().replace(/\s+/g, ' ')).slice(1)
        for (const error of data) {
          if (!error)
            break
          const [pos, _, ...rest] = error.split(' ')
          const msg = rest.slice(0, -1).join(' ')
          const rule = rest.slice(-1)[0]
          const [line, character] = pos.split(':').map(i => +i)
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
        if (!errors.length)
          return message.warn('当前行没有eslint错误')

        isPending = true
        createProgress({
          title: 'Progress Bar: vscode-eslint-disable-keypress',
          async done(report) {
            let count = 10
            report({
              message: 'Progress bar 10% completed',
              increment: count,
            })
            await p(() => {
              timer = setInterval(() => {
                if (isPending) {
                  if (count <= 90) {
                    count += 10
                    report({
                      message: `Progress bar ${count}% completed`,
                      increment: count,
                    })
                  }
                }
              }, 200)
            })
            report({
              message: 'Progress bar 100% completed',
              increment: 100,
            })
          },
        })
        const temp = []
        for (const item of errors) {
          const { line, rule } = item
          if (line >= startPosition.line + 1 && line <= newEndPosition.line + 1)
            temp.push(rule)
          else if (line > newEndPosition.line + 1)
            break
        }
        insertText = `/* eslint-disable ${temp.join(',')} */\n`

        updateText((edit) => {
          edit.insert(startPosition, insertText)
          edit.insert(createPosition(newEndPosition.line + 1, 0), '/* eslint-enable */\n')
          setTimeout(() => {
            isPending = false
            resolver()
            clearInterval(timer)
          }, 500)
        })
        nextTick(() => {
          jumpToLine([selection.line, insertText.length - 4])
        })
      }
      else {
        if (selection.line === 0 && !errors.length) {
          // /* eslint-disable */ 将整个文件禁用eslint
          insertText = '// eslint-disable\n'
          updateText((edit) => {
            edit.insert(createPosition(0, 0), insertText)
          })
        }
        else {
          // 下一行eslint eslint-disable-next-line
          if (!errors.length) {
            message.warn('当前行没有eslint错误')
            return
          }
          isPending = true
          createProgress({
            title: 'Progress Bar: vscode-eslint-disable-keypress',
            async done(report) {
              let count = 10
              report({
                message: 'Progress bar 10% completed',
                increment: count,
              })
              await p(() => {
                timer = setInterval(() => {
                  if (isPending) {
                    if (count <= 90) {
                      count += 10
                      report({
                        message: `Progress bar ${count}% completed`,
                        increment: count,
                      })
                    }
                  }
                }, 200)
              })
              report({
                message: 'Progress bar 100% completed',
                increment: 100,
              })
            },
          })

          const temp = []
          for (const item of errors) {
            const { line, rule } = item
            if (line === selection.line + 1)
              temp.push(rule)
            else if (line > selection.line + 1)
              break
          }
          insertText = `// eslint-disable-next-line ${temp.join(',')}\n`

          updateText((edit) => {
            edit.insert(createPosition(selection.line, 0), insertText)
            setTimeout(() => {
              isPending = false
              resolver()
              clearInterval(timer)
            }, 500)
          })
          nextTick(() => {
            jumpToLine([selection.line, insertText.length])
          })
        }
      }
      isWorking = false
    })
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
