import { nextTick } from 'node:process'
import { createCompletionItem, createPosition, getLineText, getOffsetFromPosition, getPosition, getSelection, jumpToLine, registerCommand, registerCompletionItemProvider, updateText } from '@vscode-use/utils'
import type { Disposable, ExtensionContext } from 'vscode'
import { options } from './constants'

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
  disposes.push(registerCommand('vscode-eslint-disable-keypress.on', () => {
    const selection = getSelection()
    if (!selection)
      return
    let insetText = ''
    if (selection.selectedTextArray.length > 1) {
      // /* eslint-disable */  /* eslint-enable */
      // todo: 多个选择快触发
    }
    else if (isBlock(selection.selectedTextArray[0])) {
      const offset = getOffsetFromPosition(createPosition(selection.line, selection.character))!
      const newEndPosition = getPosition(offset + selection.selectedTextArray[0].length)
      insetText = '/* eslint-disable  */\n'
      updateText((edit) => {
        edit.insert(createPosition(selection.line, 0), insetText)
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
        insetText = '// eslint-disable-next-line\n'

        updateText((edit) => {
          edit.insert(createPosition(selection.line, 0), insetText)
        })
        nextTick(() => {
          jumpToLine([selection.line, insetText.length])
        })
      }
    }
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
