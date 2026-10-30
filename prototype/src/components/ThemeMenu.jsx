import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react';
import { Menu } from './ui/index.jsx';

export function ThemeMenu({ theme, expanded }) {
  const labels = { light: '浅色', dark: '深色', system: '跟随系统' };
  const CurrentIcon = theme.preference === 'system' ? IconDeviceDesktop : theme.resolved === 'dark' ? IconMoon : IconSun;
  return <Menu label="外观设置" className="appearance-menu" icon={<CurrentIcon size={21} stroke={1.65} />}
    items={[
      { label: '浅色', value: 'light', icon: <IconSun size={17} />, selected: theme.preference === 'light', onClick: () => theme.change('light') },
      { label: '深色', value: 'dark', icon: <IconMoon size={17} />, selected: theme.preference === 'dark', onClick: () => theme.change('dark') },
      { separator: true },
      { label: '跟随系统', value: 'system', icon: <IconDeviceDesktop size={17} />, selected: theme.preference === 'system', onClick: () => theme.change('system') },
    ]}>{expanded ? <><span>外观</span><small>{labels[theme.preference]}</small></> : null}</Menu>;
}
