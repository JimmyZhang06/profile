import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { IconArrowBackUp, IconArrowForwardUp, IconBold, IconCheck, IconClearFormatting, IconItalic, IconUnderline, IconMessageCircle } from '@tabler/icons-react';
import { Button, IconButton, Menu } from './ui/index.jsx';
import { fromEditorContent, toEditorContent } from '../lib/richText.js';

const extensions = [StarterKit.configure({ blockquote: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false, heading: false, horizontalRule: false, code: false, codeBlock: false, link: false, strike: false, trailingNode: false })];
function moveParagraph(editor, direction) {
  const {doc,selection,tr} = editor.state, from = selection.$from.index(0), to = from + direction;
  if (to < 0 || to >= doc.childCount) return;
  const index = Math.min(from,to), left = doc.child(index), right = doc.child(index+1);
  let start = 0;
  for (let i=0;i<index;i++) start += doc.child(i).nodeSize;
  tr.replaceWith(start,start+left.nodeSize+right.nodeSize,[right,left]);
  tr.setSelection(TextSelection.create(tr.doc,start+(direction > 0 ? right.nodeSize : 0)+1));
  editor.view.dispatch(tr); editor.view.focus();
}
export default function RichTextEditor({ host, label, value, marks, onChange, onSave, onCancel, onAsk, points, projectOrder, onMove }) {
  const callbacks = useRef({ onChange, onSave, onCancel }); callbacks.current = { onChange, onSave, onCancel };
  const editor = useEditor({
    extensions, content: toEditorContent(value, marks), immediatelyRender: false, shouldRerenderOnTransaction: false, autofocus: 'end',
    editorProps: {
      attributes: { class: 'richtext-input', role: 'textbox', 'aria-label': '编辑所选文字', 'aria-multiline': 'true', spellcheck: 'false' },
      handleKeyDown: (_view, event) => {
        if (event.isComposing) return false;
        if (event.key === 'Escape') { event.preventDefault(); callbacks.current.onCancel(); return true; }
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); callbacks.current.onSave(); return true; }
        return false;
      },
    },
    onUpdate: ({ editor: active }) => callbacks.current.onChange(fromEditorContent(active.getJSON())),
  });
  const active = useEditorState({ editor, selector: ({ editor: current }) => current ? {
    bold: current.isActive('bold'), italic: current.isActive('italic'), underline: current.isActive('underline'),
    paragraph:current.state.selection.$from.index(0), count:current.state.doc.childCount,
    undo:current.can().undo(), redo:current.can().redo(),
  } : {} });
  const markButton = (name, title, Icon, command) => <IconButton label={title} aria-pressed={!!active?.[name]} disabled={!editor} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus()[command]().run()}><Icon size={17} /></IconButton>;
  return <section className="inline-editor richtext-editor paper-edit-tools" aria-label={'编辑' + label}>
    <div className="richtext-toolbar" role="toolbar" aria-label="文字格式">
      {markButton('bold', '加粗 · Ctrl / ⌘ B', IconBold, 'toggleBold')}
      {markButton('italic', '斜体 · Ctrl / ⌘ I', IconItalic, 'toggleItalic')}
      {markButton('underline', '下划线 · Ctrl / ⌘ U', IconUnderline, 'toggleUnderline')}
      <span className="format-divider" />
      <IconButton label="清除文字格式" disabled={!editor} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().unsetAllMarks().run()}><IconClearFormatting size={17} /></IconButton>
      <Menu label={points ? '要点操作' : '更多编辑'} value={points ? '要点' : '更多'} className="opens-up" items={[
        ...(points ? [{label:'换行添加要点',onClick:() => editor?.chain().focus('end').splitBlock().run()}] : []),
        ...(points && active?.count > 1 ? [
          {label:'上移当前段落',disabled:active.paragraph < 1,onClick:() => moveParagraph(editor,-1)},
          {label:'下移当前段落',disabled:active.paragraph >= active.count-1,onClick:() => moveParagraph(editor,1)},
        ] : []),
        ...(projectOrder ? [
          {label:'在项目中上移',disabled:!projectOrder.up,onClick:() => onMove(-1)},
          {label:'在项目中下移',disabled:!projectOrder.down,onClick:() => onMove(1)},
        ] : []),
        {label:'撤销文字编辑',icon:<IconArrowBackUp size={16} />,disabled:!active?.undo,onClick:() => editor?.chain().focus().undo().run()},
        {label:'重做文字编辑',icon:<IconArrowForwardUp size={16} />,disabled:!active?.redo,onClick:() => editor?.chain().focus().redo().run()},
      ]} />
    </div>
    {createPortal(<EditorContent className="paper-editor-content" editor={editor} />, host)}
    <div className="inline-editor-actions">
      {onAsk && <Button variant="ghost" onClick={onAsk}><IconMessageCircle size={15} />对话打磨</Button>}
      <Button variant="ghost" onClick={onCancel}>取消</Button><Button disabled={!editor} onClick={onSave}>完成<IconCheck size={15} /></Button>
    </div>
  </section>;
}
