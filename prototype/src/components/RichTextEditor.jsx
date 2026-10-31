import { useRef } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { IconArrowBackUp, IconArrowForwardUp, IconBold, IconCheck, IconClearFormatting, IconItalic, IconUnderline } from '@tabler/icons-react';
import { Button, IconButton } from './ui/index.jsx';
import { fromEditorContent, toEditorContent } from '../lib/richText.js';

const extensions = [StarterKit.configure({ blockquote: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false, heading: false, horizontalRule: false, code: false, codeBlock: false, link: false, strike: false, trailingNode: false })];
export default function RichTextEditor({ label, value, marks, onChange, onSave, onCancel }) {
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
    undo: current.can().undo(), redo: current.can().redo(),
  } : {} });
  const markButton = (name, title, Icon, command) => <IconButton label={title} aria-pressed={!!active?.[name]} disabled={!editor} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus()[command]().run()}><Icon size={17} /></IconButton>;
  return <section className="inline-editor richtext-editor" aria-label={'编辑' + label}>
    <div className="richtext-heading"><strong>{label}</strong><span>选中文字，设置格式</span></div>
    <div className="richtext-toolbar" role="toolbar" aria-label="文字格式">
      {markButton('bold', '加粗 · Ctrl / ⌘ B', IconBold, 'toggleBold')}
      {markButton('italic', '斜体 · Ctrl / ⌘ I', IconItalic, 'toggleItalic')}
      {markButton('underline', '下划线 · Ctrl / ⌘ U', IconUnderline, 'toggleUnderline')}
      <span className="format-divider" />
      <IconButton label="清除文字格式" disabled={!editor} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().unsetAllMarks().run()}><IconClearFormatting size={17} /></IconButton>
      <span className="richtext-history">
        <IconButton label="撤销文字编辑" disabled={!active?.undo} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().undo().run()}><IconArrowBackUp size={16} /></IconButton>
        <IconButton label="重做文字编辑" disabled={!active?.redo} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().redo().run()}><IconArrowForwardUp size={16} /></IconButton>
      </span>
    </div>
    <EditorContent className="richtext-content" editor={editor} />
    <div className="inline-editor-actions"><span>Ctrl / ⌘ Enter 保存</span><Button variant="ghost" onClick={onCancel}>取消</Button><Button disabled={!editor} onClick={onSave}>保存修改<IconCheck size={15} /></Button></div>
  </section>;
}
