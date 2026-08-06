import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';

import Layout from './components/Layout';
import NotFound from './pages/NotFound/NotFound';
import ProcurementSubmitPage from './pages/ProcurementSubmit/ProcurementSubmitPage';
import MyRequirementsPage from './pages/MyRequirements/MyRequirementsPage';
import TaskManagementPage from './pages/TaskManagement/TaskManagementPage';
import AnalyticsPage from './pages/Analytics/AnalyticsPage';
import RequirementDetailPage from './pages/RequirementDetail/RequirementDetailPage';
import VisitorRecordPage from './pages/VisitorRecord/VisitorRecordPage';
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';

const ProtectedRoute: React.FC<{ children: React.ReactNode; requiredRoles: string[] }> = ({ children, requiredRoles }) => {
  const { ability, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen text-muted-foreground">加载中...</div>;
  const hasPermission = requiredRoles.some((role) => ability.can(role, ROLE_SUBJECT));
  return hasPermission ? <>{children}</> : <Navigate to="/" replace />;
};

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ProcurementSubmitPage />} />
        <Route path="my-requirements" element={<MyRequirementsPage />} />
        <Route path="tasks" element={<ProtectedRoute requiredRoles={['task_manager']}><TaskManagementPage /></ProtectedRoute>} />
        <Route path="analytics" element={<ProtectedRoute requiredRoles={['admin']}><AnalyticsPage /></ProtectedRoute>} />
        <Route path="requirements/:id" element={<RequirementDetailPage />} />
        <Route path="visitor-records" element={<ProtectedRoute requiredRoles={['admin']}><VisitorRecordPage /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
