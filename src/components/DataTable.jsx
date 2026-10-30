import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, BadgePercent, Boxes, ChartNoAxesCombined,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardList,
  LayoutDashboard, LoaderCircle, LogOut, Menu, Package, Pencil, Plus,
  Search, Settings2, Shapes, ShoppingBag, Tag, Trash2, Truck, Users, Wallet, X,
} from 'lucide-react';
import { apiRequest } from '../api.js';
import { errorMessage, normalize, recordId } from '../utils/admin.js';

export function DataTable({ columns, items, loading, emptyText, renderCell, actions }) {
  const colspan = columns.length + (actions ? 1 : 0);
  return <div className="table-scroll"><table className="resource-table"><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}{actions && <th className="actions-heading">Actions</th>}</tr></thead><tbody>
    {loading && <tr><td className="table-message" colSpan={colspan}><LoaderCircle className="spin" size={18} /> Loading…</td></tr>}
    {!loading && !items.length && <tr><td className="table-message" colSpan={colspan}><ClipboardList size={20} /> {emptyText}</td></tr>}
    {!loading && items.map((item, index) => <tr key={recordId(item) || index}>{columns.map((column) => <td key={column.key}>{renderCell(item, column.key)}</td>)}{actions && <td className="row-actions">{actions(item)}</td>}</tr>)}
  </tbody></table></div>;
}

export function usePagedList(path, token, filters = {}) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const filtersKey = JSON.stringify(filters);
  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await apiRequest(path, { token, query: { page, limit: 10, ...JSON.parse(filtersKey) } });
      const nextItems = (response.data || []).map(normalize);
      const nextPagination = response.pagination || { page, limit: 10, total: nextItems.length, totalPages: 1 };
      setPagination(nextPagination);
      if (page > Math.max(1, nextPagination.totalPages || 1)) {
        setPage(Math.max(1, nextPagination.totalPages || 1));
        return;
      }
      setItems(nextItems);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [filtersKey, page, path, token, refresh]);
  useEffect(() => { load(); }, [load]);
  return { items, setItems, pagination, page, setPage, loading, error, setError, refresh: () => setRefresh((value) => value + 1) };
}

export function Pager({ pagination, page, setPage, loading }) {
  return <div className="pagination"><span>{pagination.total || 0} records</span><div><button className="icon-button" type="button" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={17} /></button><span>Page {page} of {Math.max(1, pagination.totalPages || 1)}</span><button className="icon-button" type="button" aria-label="Next page" disabled={page >= (pagination.totalPages || 1) || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={17} /></button></div></div>;
}
