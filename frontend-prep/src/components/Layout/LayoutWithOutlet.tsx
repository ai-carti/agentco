import React from 'react';
import { Outlet } from 'react-router-dom';
import { AppLayout } from './AppLayout';

/**
 * Thin wrapper used as a layout route element.
 * Renders AppLayout with <Outlet /> as its children.
 */
export const LayoutWithOutlet: React.FC = () => (
  <AppLayout>
    <Outlet />
  </AppLayout>
);
