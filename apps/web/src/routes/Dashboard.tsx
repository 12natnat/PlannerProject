import { useState, useMemo } from 'react';
import { useDashboard } from '../hooks/useDashboard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { AlertCircle, CheckCircle2, Clock, Search, Calendar, ShieldAlert } from 'lucide-react';

export function Dashboard() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showUrgentOnly, setShowUrgentOnly] = useState<boolean>(false);

  const { data, isLoading, error } = useDashboard(selectedDate);

  // Apply filters on the data received
  const filteredGapAnalysis = useMemo(() => {
    if (!data?.gapAnalysis) return [];
    
    return data.gapAnalysis.filter((item) => {
      // 1. Search Query Filter (Part Number or Name)
      const matchesSearch =
        item.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.itemName.toLowerCase().includes(searchQuery.toLowerCase());

      // 2. Urgent / Shortage Only Filter
      const matchesUrgent = !showUrgentOnly || item.status === 'SHORTAGE';

      return matchesSearch && matchesUrgent;
    });
  }, [data?.gapAnalysis, searchQuery, showUrgentOnly]);

  const filteredWipStatus = useMemo(() => {
    if (!data?.wipStatus) return [];
    
    return data.wipStatus.filter((wip) => {
      // Search filter for WIP
      return (
        wip.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wip.itemName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [data?.wipStatus, searchQuery]);

  // Recalculate summary metrics based on filtered set
  const summaryMetrics = useMemo(() => {
    if (!data) return { total: 0, fulfilled: 0, inProduction: 0, shortage: 0 };
    
    const baseList = showUrgentOnly
      ? data.gapAnalysis.filter((item) => item.status === 'SHORTAGE')
      : data.gapAnalysis;

    const filtered = baseList.filter((item) =>
      item.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.itemName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const fulfilled = filtered.filter(i => i.status === 'FULFILLED').length;
    const inProduction = filtered.filter(i => i.status === 'IN_PRODUCTION').length;
    const shortage = filtered.filter(i => i.status === 'SHORTAGE').length;

    return {
      total: filtered.length,
      fulfilled,
      inProduction,
      shortage,
    };
  }, [data, searchQuery, showUrgentOnly]);

  const chartData = useMemo(() => {
    return filteredGapAnalysis.map(item => ({
      name: item.itemCode,
      demand: item.demand,
      fgStock: item.fgStock,
      wip: item.wip,
    }));
  }, [filteredGapAnalysis]);

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading dashboard data...</div>;
  }

  if (error) {
    return <div className="bg-destructive/15 text-destructive p-4 rounded-md">Error loading dashboard: {error.message}</div>;
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Premium Filter Toolbar */}
      <div className="bg-card text-card-foreground p-4 border rounded-lg shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Date Filter */}
          <div className="relative min-w-[200px]">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              type="date"
              className="w-full h-10 pl-9 pr-3 border rounded-md bg-background text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              type="text"
              placeholder="Filter by Part Number / Toy Name..."
              className="w-full h-10 pl-9 pr-3 border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Urgent Only Switch */}
        <button
          onClick={() => setShowUrgentOnly(!showUrgentOnly)}
          className={`h-10 px-4 rounded-md font-semibold text-sm flex items-center gap-2 border transition-all ${
            showUrgentOnly
              ? 'bg-destructive/10 border-destructive text-destructive'
              : 'bg-background hover:bg-muted text-muted-foreground'
          }`}
        >
          <ShieldAlert size={16} />
          {showUrgentOnly ? 'Urgent Items (Shortage Only)' : 'Show Urgent (Shortage)'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card text-card-foreground shadow-sm border rounded-lg p-6">
          <h3 className="text-muted-foreground font-medium mb-2 text-sm">Filtered Items</h3>
          <p className="text-3xl font-bold">{summaryMetrics.total}</p>
        </div>
        <div className="bg-card text-card-foreground shadow-sm border rounded-lg p-6">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-muted-foreground font-medium mb-2 text-sm">Fulfilled</h3>
              <p className="text-3xl font-bold text-green-600 dark:text-green-500">{summaryMetrics.fulfilled}</p>
            </div>
            <CheckCircle2 className="text-green-600 dark:text-green-500" />
          </div>
        </div>
        <div className="bg-card text-card-foreground shadow-sm border rounded-lg p-6">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-muted-foreground font-medium mb-2 text-sm">In Production</h3>
              <p className="text-3xl font-bold text-amber-500">{summaryMetrics.inProduction}</p>
            </div>
            <Clock className="text-amber-500" />
          </div>
        </div>
        <div className="bg-card text-card-foreground shadow-sm border rounded-lg p-6">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-muted-foreground font-medium mb-2 text-sm">Shortage Alert</h3>
              <p className="text-3xl font-bold text-destructive">{summaryMetrics.shortage}</p>
            </div>
            <AlertCircle className="text-destructive" />
          </div>
        </div>
      </div>

      {/* Main Charts / Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-card text-card-foreground shadow-sm border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-6">Demand vs Supply Gap Analysis</h3>
          <div className="h-[350px] w-full">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No data matching active filters.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                    labelStyle={{
                      color: 'hsl(var(--foreground))',
                      fontWeight: 'bold'
                    }}
                    itemStyle={{
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="demand" name="Daily Demand" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="fgStock" name="FG Stock" fill="#16a34a" stackId="a" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="wip" name="WIP" fill="#f59e0b" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Critical Shortages Sidebar List */}
        <div className="bg-card text-card-foreground shadow-sm border rounded-lg p-6 overflow-hidden flex flex-col">
          <h3 className="text-lg font-semibold mb-4 text-destructive flex items-center gap-2">
            <AlertCircle size={18} /> Critical Shortages
          </h3>
          <div className="flex-1 overflow-auto">
            {filteredGapAnalysis.filter(i => i.status === 'SHORTAGE').length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No shortages found for current filters.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredGapAnalysis
                  .filter(i => i.status === 'SHORTAGE')
                  .sort((a, b) => b.gap - a.gap) // Sort by largest shortage
                  .map((item) => (
                    <div key={item.itemCode} className="border-b pb-3 last:border-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-sm max-w-[170px] truncate" title={item.itemName}>{item.itemName}</span>
                        <span className="text-destructive font-bold text-sm bg-destructive/10 px-2 py-0.5 rounded">{item.gap.toLocaleString()} pcs</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{item.itemCode}</span>
                        <span>Demand: {item.demand.toLocaleString()} | Supply: {(item.fgStock + item.wip).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* WIP Status Table */}
      <div className="bg-card text-card-foreground shadow-sm border rounded-lg overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">Active Work In Progress (WIP)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
              <tr>
                <th className="px-6 py-3 font-medium">Item Code</th>
                <th className="px-6 py-3 font-medium">Item Name</th>
                <th className="px-6 py-3 font-medium">Location</th>
                <th className="px-6 py-3 font-medium">Quantity</th>
                <th className="px-6 py-3 font-medium">Progress</th>
              </tr>
            </thead>
            <tbody>
              {filteredWipStatus.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    No active WIP records found matching active filters
                  </td>
                </tr>
              ) : (
                filteredWipStatus.map((wip, idx) => (
                  <tr key={`${wip.itemCode}-${idx}`} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium">{wip.itemCode}</td>
                    <td className="px-6 py-4">{wip.itemName}</td>
                    <td className="px-6 py-4">
                      <span className="bg-secondary px-2 py-1 rounded text-xs font-medium">{wip.location}</span>
                    </td>
                    <td className="px-6 py-4 font-semibold">{wip.qty.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-secondary rounded-full h-2.5 max-w-[100px]">
                          <div className="bg-primary h-2.5 rounded-full" style={{ width: `${wip.progress}%` }}></div>
                        </div>
                        <span className="text-xs">{wip.progress}%</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
