import { IconLayoutSidebarLeftExpand, IconMaximize, IconMinus, IconPlus, IconTextSize } from '@tabler/icons-react';
import { IconButton, Menu } from './ui/index.jsx';

export function PreviewControls({ view, onViewChange, readingSize, onReadingSizeChange, zoom, scale, onZoomChange, focus, onFocus, showFocus = true }) {
  const percentage = Math.round(scale * 100);
  return <footer className="canvas-footer preview-controls" aria-label="预览显示设置">
    <div className="canvas-view-switch" role="group" aria-label="简历显示方式">
      <button type="button" aria-pressed={view === 'read'} onClick={() => onViewChange('read')}>阅读</button>
      <button type="button" aria-pressed={view === 'page'} onClick={() => onViewChange('page')}>A4 预览</button>
    </div>
    <div className="preview-control-group">
      {view === 'read' ? <div className="preview-control-surface" title="调整屏幕阅读字号，导出排版不变">
        <Menu label="阅读字号" className="preview-size-menu opens-up" icon={<IconTextSize size={16} />} value={<span>阅读 <b>{readingSize}</b></span>} items={[14, 15, 16, 17, 18, 20, 22].map(size => ({ label: `阅读字号 · ${size}`, selected: readingSize === size, onClick: () => onReadingSizeChange(size) }))} />
      </div> : <div className="preview-control-surface preview-zoom-controls" role="group" aria-label="A4 预览缩放">
        <IconButton label="缩小简历" disabled={percentage <= 40} onClick={() => onZoomChange(String(Math.max(40, percentage - 10)))}><IconMinus size={15} /></IconButton>
        <Menu label="缩放比例" className="preview-scale-menu opens-up" value={<span>{percentage}%</span>} items={['fit', '50', '75', '100', '125', '150'].map(value => ({
          label: value === 'fit' ? '适应宽度' : value + '%', selected: zoom === value, onClick: () => onZoomChange(value),
        }))} />
        <IconButton label="放大简历" disabled={percentage >= 150} onClick={() => onZoomChange(String(Math.min(150, percentage + 10)))}><IconPlus size={15} /></IconButton>
      </div>}
      {showFocus ? <IconButton className="canvas-focus-button preview-focus-button" label={focus ? '恢复对话视图' : '专注编辑'} aria-pressed={focus} onClick={onFocus}>
        {focus ? <IconLayoutSidebarLeftExpand size={17} /> : <IconMaximize size={17} />}
      </IconButton> : null}
    </div>
  </footer>;
}
