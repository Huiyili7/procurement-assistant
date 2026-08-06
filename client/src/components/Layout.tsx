import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Outlet, Link, useLocation } from "react-router-dom";

import { useCurrentUserProfile } from "@lark-apaas/client-toolkit/hooks/useCurrentUserProfile";
import { MessageSquareText, ListChecks, ClipboardList, ShoppingCart, Users, BarChart3 } from "lucide-react";
import { CanRole, useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';
import { recordVisit } from '@client/src/api/visitor-record';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDataloom } from "@lark-apaas/client-toolkit/dataloom";
import { logger } from "@lark-apaas/client-toolkit/logger";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

const navItems = [
  { path: "/", label: "采购需求提交", icon: MessageSquareText },
  { path: "/my-requirements", label: "我的采购需求", icon: ClipboardList },
];

const restrictedNavItems = [
  { path: "/tasks", label: "采购任务管理", icon: ListChecks },
];

const adminNavItems = [
  { path: "/analytics", label: "采购效能分析", icon: BarChart3 },
  { path: "/visitor-records", label: "访客记录", icon: Users },
];

const LayoutContent = () => {
  const { pathname } = useLocation();

  const userInfo = useCurrentUserProfile();
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const { ability, isLoading: authLoading } = useAuth();

  const isAdmin = !authLoading && ability.can('admin', ROLE_SUBJECT);
  const isLoggedIn = !!userInfo?.user_id;

  useEffect(() => {
    if (isLoggedIn && userInfo?.name) {
      recordVisit({
        visitorName: userInfo.name,
        visitorDepartment: '',
        action: 'browse',
      });
    }
  }, [isLoggedIn, userInfo?.name]);

  // 使用时长心跳：页面可见时每 90 秒上报一次，切后台/锁屏暂停，避免把挂机算进时长
  useEffect(() => {
    if (!isLoggedIn || !userInfo?.name) return;
    const name = userInfo.name;
    const HEARTBEAT_MS = 90 * 1000;
    let timer: ReturnType<typeof setInterval> | undefined;

    const beat = () => {
      if (document.visibilityState === 'visible') {
        recordVisit({ visitorName: name, action: 'heartbeat' });
      }
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(beat, HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') start();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [isLoggedIn, userInfo?.name]);

  const displayName = userInfo?.name || "游客";
  const avatarUrl = userInfo?.avatar || "https://lf3-static.bytednsdoc.com/obj/eden-cn/LMfspH/ljhwZthlaukjlkulzlp/miao/no-person.svg";

  const handleLogout = async () => {
    try {
      const dataloom = await getDataloom();
      const result = await dataloom.service.session.signOut();
      if (result.error) {
        logger.error("退出登录失败:", result.error.message);
        return;
      }
      window.location.reload();
    } catch (e) {
      logger.error("退出登录异常:", e);
    }
  };

  const handleLogin = async () => {
    const dataloom = await getDataloom();
    dataloom.service.session.redirectToLogin();
  };

  const activeItem = [...navItems, ...restrictedNavItems].find((item) => item.path === pathname);
  const activeTitle = activeItem?.label || "采购效能分析";

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <ShoppingCart className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold">xTool机械效能采购小助手</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={pathname === item.path}>
                      <Link to={item.path}>
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {restrictedNavItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <CanRole roles={['task_manager']} fallback={null}>
                      <SidebarMenuButton asChild isActive={pathname === item.path}>
                        <Link to={item.path}>
                          <item.icon className="size-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </CanRole>
                  </SidebarMenuItem>
                ))}
                {adminNavItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <CanRole roles={['admin']} fallback={null}>
                      <SidebarMenuButton asChild isActive={pathname === item.path}>
                        <Link to={item.path}>
                          <item.icon className="size-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </CanRole>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="size-8 rounded-full object-cover"
                    />
                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate font-semibold">{displayName}</span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  {isLoggedIn ? (
                    <DropdownMenuItem onClick={() => setLogoutDialogOpen(true)}>
                      退出登录
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={handleLogin}>
                      登录
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 flex flex-col overflow-hidden p-3 md:p-6">
        <header className="flex items-center gap-2 mb-4 md:mb-6">
          <SidebarTrigger />
          <h1 className="text-xl md:text-2xl font-bold text-foreground">{activeTitle}</h1>
        </header>
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>

      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认退出登录</DialogTitle>
            <DialogDescription>退出后需要重新登录才能使用系统功能。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogoutDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              确认退出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const Layout = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default Layout;
