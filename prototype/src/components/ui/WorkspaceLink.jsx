import { useContext } from 'react';
import { PageNavigationContext } from '../../hooks/usePageNavigation.js';

export function WorkspaceLink({ href, children, ...props }) {
  const navigation = useContext(PageNavigationContext);
  function follow(event) {
    if (!navigation?.openLink || event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigation.openLink(href);
  }
  return <a {...props} href={href} onClick={follow}>{children}</a>;
}
