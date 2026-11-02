import { IconArrowLeft, IconDots, IconLogout, IconShieldCheck } from '@tabler/icons-react';
import { BrandLogo } from '../BrandLogo.jsx';
import { ThemeMenu } from '../ThemeMenu.jsx';
import { Menu } from '../ui/index.jsx';
import './admin-mobile.css';

export function AdminHeader({ sections, section, navigate, theme, onLogout }) {
  const title = sections.find(([id]) => id === section)?.[1] || '管理后台';
  return <header className="admin-topbar">
    <span className="admin-desktop-title">{title}</span>
    <div className="admin-mobile-navigation">
      <button className="admin-mobile-brand" aria-label="履历管理后台首页" onClick={() => navigate('overview')}><BrandLogo /></button>
      <Menu label="切换后台页面" value={title} className="admin-section-menu"
        items={sections.map(([id, label, Icon]) => ({ label, icon: <Icon size={19} />, selected: section === id, onClick: () => navigate(id) }))} />
    </div>
    <span className="admin-verification-label"><IconShieldCheck size={15} />管理员 · 已验证</span>
    <div className="admin-mobile-actions">
      <ThemeMenu theme={theme} />
      <Menu label="后台更多操作" className="admin-more-menu" icon={<IconDots size={21} />}
        items={[
          { label: '返回个人工作区', icon: <IconArrowLeft size={18} />, onClick: () => navigate('/') },
          { separator: true },
          { label: '退出登录', icon: <IconLogout size={18} />, onClick: onLogout },
        ]} />
    </div>
  </header>;
}
