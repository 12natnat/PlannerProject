import React, { useState, useMemo } from 'react';
import { useDailySchedules, useUpsertDailySchedule, useBulkUpsertDailySchedule, useBulkDeleteDailySchedule } from '../hooks/useDailySchedule';
import { useItems, useMasterCartons } from '../hooks/useItems';
import { SearchableSelect } from '../components/SearchableSelect';
import { Calendar, Plus, Save, Upload, Trash2, Search, Edit2 } from 'lucide-react';
// import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { useAuthStore } from '../stores/authStore';

interface ImportRecord {
  id: string;
  toyName: string;
  masterCarton: string;
  itemCode: string;
  date: string;
  shift: number;
  quantity: number;
}

// Helper to convert Excel serial date number to YYYY-MM-DD string
function excelSerialToDate(serial: number): string {
  try {
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (parsed) {
      const year = parsed.y;
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    // Ignore and fallback
  }
  // Excel uses 1900-01-01 as day 1, but JavaScript Date uses 1970-01-01
  // The offset 25569 is the number of days between 1900-01-01 and 1970-01-01
  // But Excel incorrectly treats 1900 as a leap year, so we need to subtract 1
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  // Fix timezone offset issue - use UTC to avoid local timezone shifting
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse the FA_Attach sheet from the weekly production schedule Excel.
 * 
 * Layout Structure:
 *   Row 8 (0-indexed): Headers => col B = "Toy Name", col E/H/K/N/Q/T/W = date serial numbers (merged across 3 shift cols)
 *   Row 9: Sub-headers => "Shift 1", "Shift 2", "Shift 3" repeating for each day
 *   Row 10+: Data rows
 *     - Toy Name rows (blue background): col B = long toy name (e.g. "BRB RFRSH GYMNST PS"), col C empty, no quantities
 *     - Data rows: col B = Master Carton code (e.g. "HRG52-9565"), col C = Part Number (e.g. "HRG52-4B12"), quantities in shift columns
 *     - Total rows: col B = "Total"
 * 
 * Detection logic:
 *   - Toy Name: col B has value, col C empty, no quantities → set currentToyName
 *   - Data row: col B = Master Carton, col C = Part Number, has quantities → create records
 * 
 * Example:
 *   Toy Name: "BRB RFRSH GYMNST PS" (col B only)
 *   Master Carton: "HRG52-9445" (col B) | Part Number: "HRG52-4B12" (col C) | Qty: 400 (shift 2, date 17-Apr)
 */
function parseFAAttachSheet(ws: XLSX.WorkSheet): ImportRecord[] {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const results: ImportRecord[] = [];

  // Step 1: Find header row with "Toy Name" in column B
  let headerRow = -1;
  for (let r = 0; r <= Math.min(20, range.e.r); r++) {
    const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    console.log(`Checking header row ${r}, col B: "${cellB ? cellB.v : 'empty'}"`);
    if (cellB && String(cellB.v).trim().toLowerCase() === 'toy name') {
      headerRow = r;
      console.log(`✅ Found "Toy Name" header at row ${r}`);
      break;
    }
  }
  if (headerRow === -1) {
    console.log('❌ Could not find "Toy Name" header in column B');
    return results;
  }

  // Step 2: Extract shift columns by finding dates and sub-headers
  const shiftColumns: { col: number; date: string; shiftNum: number }[] = [];
  let lastDateStr = '';
  
  for (let c = 2; c <= range.e.c; c++) {
    const headerCell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
    if (headerCell && headerCell.v != null) {
      let dateStr = '';
      if (typeof headerCell.v === 'number' && headerCell.v > 40000) {
        dateStr = excelSerialToDate(headerCell.v);
      } else if (typeof headerCell.v === 'string') {
        const trimmed = headerCell.v.trim();
        if (trimmed.match(/^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/) || trimmed.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
          const d = new Date(trimmed);
          if (!isNaN(d.getTime())) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
          }
        }
      }
      if (dateStr) lastDateStr = dateStr;
    }
    
    // Read the sub-header to see if it's a shift column
    const subCell = ws[XLSX.utils.encode_cell({ r: headerRow + 1, c })];
    if (subCell && typeof subCell.v === 'string') {
      const subTrim = subCell.v.trim().toLowerCase();
      if (subTrim.includes('shift 1')) {
        if (lastDateStr) shiftColumns.push({ col: c, date: lastDateStr, shiftNum: 1 });
      } else if (subTrim.includes('shift 2')) {
        if (lastDateStr) shiftColumns.push({ col: c, date: lastDateStr, shiftNum: 2 });
      } else if (subTrim.includes('shift 3')) {
        if (lastDateStr) shiftColumns.push({ col: c, date: lastDateStr, shiftNum: 3 });
      }
    }
  }

  if (shiftColumns.length === 0) return results;

  // Step 3: Parse data rows
  const dataStartRow = headerRow + 2; // Skip sub-header row (Shift 1/2/3)
  let currentToyName = '';
  let idCounter = 0;

  for (let r = dataStartRow; r <= range.e.r; r++) {
    const cellA = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    const cellC = ws[XLSX.utils.encode_cell({ r, c: 2 })];
    const cellD = ws[XLSX.utils.encode_cell({ r, c: 3 })];

    const colAVal = cellA && cellA.v != null ? String(cellA.v).trim() : '';
    const colBVal = cellB && cellB.v != null ? String(cellB.v).trim() : '';
    const colCVal = cellC && cellC.v != null ? String(cellC.v).trim() : '';
    const colDVal = cellD && cellD.v != null ? String(cellD.v).trim() : '';

    // DEBUG: Log each row being processed
    console.log(`Row ${r}: A="${colAVal}" B="${colBVal}" C="${colCVal}" D="${colDVal}"`);

    // Skip fully empty rows
    if (!colAVal && !colBVal && !colCVal) continue;

    // Skip Total rows (col B says "Total" or row combined contains only "total")
    if (colBVal.toLowerCase() === 'total' || colAVal.toLowerCase() === 'total') continue;

    // ── Row Classification ───────────────────────────────────────────────────
    //
    // The Excel layout has two row types under the header:
    //
    // 1. TOY NAME ROW (blue background):
    //    Col A = "ND"  (or empty)
    //    Col B = Toy name string (no hyphens, e.g. "BRB KITTY CONDO DV")
    //    Col C = empty (or low values)
    //    No significant quantities in shift columns
    //
    // 2. DATA ROW:
    //    Col A = "ND"
    //    Col B = Master Carton code (contains hyphen, e.g. "HHB70-9565")
    //    Col C = Part Number code   (contains hyphen, e.g. "HHB70-4B12")
    //    Quantities in shift columns
    //
    // Detection priority:
    //   • If col A = "ND" and col B contains a hyphen → data row (master carton in B, part in C)
    //   • If col A = "ND" and col B has text but no hyphen → toy name row
    // ─────────────────────────────────────────────────────────────────────────

    const colBHasHyphen = colBVal.includes('-');
    const colCHasHyphen = colCVal.includes('-');

    // Collect raw shift quantities for this row
    const rowQtys: { shiftCol: number; rawQty: number }[] = [];
    let totalRawQty = 0;
    for (const sc of shiftColumns) {
      let qty = 0;
      const qtyCell = ws[XLSX.utils.encode_cell({ r, c: sc.col })];
      if (qtyCell && qtyCell.v != null) {
        if (typeof qtyCell.v === 'number') {
          qty = qtyCell.v;
        } else if (typeof qtyCell.v === 'string') {
          const cleaned = qtyCell.v.replace(/,/g, '').trim();
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed)) qty = parsed;
        }
      }
      rowQtys.push({ shiftCol: sc.col, rawQty: qty });
      totalRawQty += qty;
    }

    // ── Toy Name Row ─────────────────────────────────────────────────────────
    // MUST have "ND" in col A and non-hyphenated text in col B with no quantities
    if (colAVal === 'ND' && colBVal && !colBHasHyphen && totalRawQty === 0) {
      console.log(`🎯 TOY NAME ROW: Setting currentToyName = "${colBVal}"`);
      currentToyName = colBVal;
      continue;
    }

    // ── Data Row ─────────────────────────────────────────────────────────────
    // MUST have "ND" in col A and hyphenated master carton in col B
    if (colAVal === 'ND' && colBHasHyphen) {
      let masterCarton = colBVal;
      let partNumber = '';

      // Part number is in col C if it has a hyphen; otherwise col D
      if (colCHasHyphen) {
        partNumber = colCVal;
      } else if (colDVal.includes('-')) {
        partNumber = colDVal;
      } else if (colCVal) {
        // col C has something but no hyphen — still treat as part number
        partNumber = colCVal;
      } else {
        // Fallback: part number same as master carton
        partNumber = masterCarton;
      }

      // Handle merged cell with newline (e.g. "HHB70-9565\nHHB70-4B12")
      if (masterCarton.includes('\n')) {
        const parts = masterCarton.split('\n');
        masterCarton = parts[0].trim();
        if (!partNumber) partNumber = parts[1].trim();
      }

      console.log(`📦 DATA ROW: toyName="${currentToyName}" masterCarton="${masterCarton}" partNumber="${partNumber}" totalQty=${totalRawQty}`);

      for (const rq of rowQtys) {
        if (rq.rawQty > 0) {
          const sc = shiftColumns.find(s => s.col === rq.shiftCol)!;
          idCounter++;

          // Excel may store 1920 as 1.920 when locale uses dot as thousands sep
          let finalQty = rq.rawQty;
          if (finalQty > 0 && finalQty < 100) {
            finalQty = Math.round(finalQty * 1000);
          } else {
            finalQty = Math.round(finalQty);
          }

          console.log(`  → Record: date=${sc.date} shift=${sc.shiftNum} qty=${finalQty}`);

          results.push({
            id: `import-${idCounter}`,
            toyName: currentToyName,
            masterCarton,
            itemCode: partNumber,
            date: sc.date,
            shift: sc.shiftNum,
            quantity: finalQty,
          });
        }
      }
    }
    // Rows that reach here without a hyphen in col B and have quantities
    // are edge cases (e.g. pure numeric codes). Skip them to avoid noise.
  }

  return results;
}

export function DailySchedule() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  
  const [filterDate, setFilterDate] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<ImportRecord[]>([]);
  const [importSearch, setImportSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterShift, setFilterShift] = useState('');
  
  const { data: scheduleData, isLoading: loadingSchedules } = useDailySchedules(filterDate || undefined);
  const { data: itemsData } = useItems();
  const { data: mcData } = useMasterCartons();
  const upsertSchedule = useUpsertDailySchedule();
  const bulkUpsertSchedule = useBulkUpsertDailySchedule();
  const bulkDeleteSchedule = useBulkDeleteDailySchedule();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    shift: 1,
    itemCode: '',
    toyName: '',
    masterCarton: '',
    quantity: 100,
  });

  const schedules = scheduleData?.data || [];
  const items = itemsData?.data || [];
  const masterCartons = mcData?.data || [];

  const filteredSchedules = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const filtered = schedules.filter(s => {
      if (filterShift && s.shift !== Number(filterShift)) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return s.item.itemCode.toLowerCase().includes(q) ||
             s.item.itemName.toLowerCase().includes(q) ||
             (s.toyName && s.toyName.toLowerCase().includes(q)) ||
             (s.masterCarton && s.masterCarton.toLowerCase().includes(q)) ||
             s.date.toLowerCase().includes(q) ||
             `shift ${s.shift}`.toLowerCase().includes(q) ||
             String(s.quantity).toLowerCase().includes(q);
    });
    const future = filtered.filter(s => new Date(s.date) >= today);
    const past = filtered.filter(s => new Date(s.date) < today);
    return [...future, ...past];
  })();

  const groupedSchedules = useMemo(() => {
    const groups: Record<string, any> = {};
    for (const schedule of filteredSchedules) {
      const dateStr = typeof schedule.date === 'string' ? schedule.date.split('T')[0] : new Date(schedule.date).toISOString().split('T')[0];
      const key = `${dateStr}_${schedule.item.itemCode}_${schedule.masterCarton || ''}`;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          date: dateStr,
          itemCode: schedule.item.itemCode,
          toyName: schedule.toyName || schedule.item.itemName,
          masterCarton: schedule.masterCarton || '-',
          shift1: { id: null, quantity: 0 },
          shift2: { id: null, quantity: 0 },
          shift3: { id: null, quantity: 0 },
          total: 0,
          ids: [],
        };
      }
      if (schedule.shift === 1) groups[key].shift1 = { id: schedule.id, quantity: schedule.quantity };
      else if (schedule.shift === 2) groups[key].shift2 = { id: schedule.id, quantity: schedule.quantity };
      else if (schedule.shift === 3) groups[key].shift3 = { id: schedule.id, quantity: schedule.quantity };
      
      groups[key].total += schedule.quantity;
      groups[key].ids.push(schedule.id);
    }
    return Object.values(groups).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [filteredSchedules]);

  const [editModal, setEditModal] = useState<{ isOpen: boolean; data: any }>({
    isOpen: false,
    data: null,
  });

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.data) return;
    try {
      const records = [];
      if (editModal.data.shift1Qty > 0) records.push({ date: editModal.data.date, shift: 1, itemCode: editModal.data.itemCode, toyName: editModal.data.toyName, masterCarton: editModal.data.masterCarton === '-' ? '' : editModal.data.masterCarton, quantity: editModal.data.shift1Qty });
      if (editModal.data.shift2Qty > 0) records.push({ date: editModal.data.date, shift: 2, itemCode: editModal.data.itemCode, toyName: editModal.data.toyName, masterCarton: editModal.data.masterCarton === '-' ? '' : editModal.data.masterCarton, quantity: editModal.data.shift2Qty });
      if (editModal.data.shift3Qty > 0) records.push({ date: editModal.data.date, shift: 3, itemCode: editModal.data.itemCode, toyName: editModal.data.toyName, masterCarton: editModal.data.masterCarton === '-' ? '' : editModal.data.masterCarton, quantity: editModal.data.shift3Qty });

      if (editModal.data.ids && editModal.data.ids.length > 0) {
        await bulkDeleteSchedule.mutateAsync({ ids: editModal.data.ids });
      }
      if (records.length > 0) {
        await bulkUpsertSchedule.mutateAsync({ records, saveMode: 'add' });
      }
      setEditModal({ isOpen: false, data: null });
    } catch (err: any) {
      alert(err.message || 'Failed to update schedule');
    }
  };

  const handleDelete = async (ids: string[]) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    try {
      await bulkDeleteSchedule.mutateAsync({ ids });
    } catch (err: any) {
      alert(err.message || 'Failed to delete schedule');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected records?`)) return;
    try {
      await bulkDeleteSchedule.mutateAsync({ ids: selectedIds });
      setSelectedIds([]);
    } catch (err: any) {
      alert(err.message || 'Failed to delete records');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const newIds = new Set([...selectedIds, ...filteredSchedules.map(s => s.id)]);
      setSelectedIds(Array.from(newIds));
    } else {
      const filteredSet = new Set(filteredSchedules.map(s => s.id));
      setSelectedIds(selectedIds.filter(id => !filteredSet.has(id)));
    }
  };
  const allFilteredSelected = filteredSchedules.length > 0 && filteredSchedules.every(s => selectedIds.includes(s.id));

  const handleSubmit = async (e: React.FormEvent, saveMode: 'overwrite' | 'add') => {
    e.preventDefault();
    if (!formData.itemCode) {
      alert("Please select or enter a Part Number");
      return;
    }
    try {
      await bulkUpsertSchedule.mutateAsync({
        records: [{
          date: formData.date,
          shift: Number(formData.shift),
          itemCode: formData.itemCode,
          toyName: formData.toyName,
          masterCarton: formData.masterCarton,
          quantity: Number(formData.quantity),
        }],
        saveMode,
      });
      setShowForm(false);
      setFormData(prev => ({ ...prev, itemCode: '', toyName: '', masterCarton: '', quantity: 100 }));
    } catch (err: any) {
      alert(err.message || 'Failed to save schedule');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });

        // Try FA_Attach sheet first, then fallback to first sheet
        let ws = wb.Sheets['FA_Attach'];
        let parsed: ImportRecord[] = [];
        
        if (ws) {
          parsed = parseFAAttachSheet(ws);
        }

        // If no FA_Attach or no results, try to parse as simple format
        if (parsed.length === 0) {
          // Fallback: try any sheet for FA_Attach-like structure
          for (const sheetName of wb.SheetNames) {
            ws = wb.Sheets[sheetName];
            parsed = parseFAAttachSheet(ws);
            if (parsed.length > 0) break;
          }
        }

        if (parsed.length === 0) {
          alert('Could not parse the Excel file. Make sure it has the FA_Attach sheet with the correct format (Toy Name header, dates, and Shift 1/2/3 columns).');
          return;
        }

        setImportData(parsed);
      } catch (err) {
        console.error('Excel parse error:', err);
        alert('Failed to parse Excel file. Please check the file format.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleBulkSubmit = async (saveMode: 'overwrite' | 'add') => {
    if (importData.length === 0) return;
    try {
      await bulkUpsertSchedule.mutateAsync({
        records: importData.map(r => ({
          date: r.date,
          shift: r.shift,
          itemCode: r.itemCode,
          toyName: r.toyName,
          masterCarton: r.masterCarton,
          quantity: r.quantity,
        })),
        saveMode,
      });
      setShowImportModal(false);
      setImportData([]);
      alert(`Successfully imported ${importData.length} schedule records!`);
    } catch (err: any) {
      alert(err.message || 'Failed to bulk import Daily Schedule');
    }
  };

  const filteredImportData = importData.filter(d => {
    if (!importSearch) return true;
    const q = importSearch.toLowerCase();
    return d.itemCode.toLowerCase().includes(q) ||
           d.toyName.toLowerCase().includes(q) ||
           (d.masterCarton && d.masterCarton.toLowerCase().includes(q)) ||
           d.date.includes(q);
  });

  const groupedImportData = useMemo(() => {
    const groups: Record<string, any> = {};
    for (const r of filteredImportData) {
      const key = `${r.date}_${r.itemCode}_${r.masterCarton || ''}`;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          date: r.date,
          itemCode: r.itemCode,
          toyName: r.toyName,
          masterCarton: r.masterCarton || '-',
          shift1: { id: null, quantity: 0 },
          shift2: { id: null, quantity: 0 },
          shift3: { id: null, quantity: 0 },
          total: 0,
        };
      }
      if (r.shift === 1) groups[key].shift1 = { id: r.id, quantity: r.quantity };
      else if (r.shift === 2) groups[key].shift2 = { id: r.id, quantity: r.quantity };
      else if (r.shift === 3) groups[key].shift3 = { id: r.id, quantity: r.quantity };
      
      groups[key].total += r.quantity;
    }
    return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredImportData]);

  // Group import data summary
  const importSummary = importData.reduce((acc, r) => {
    acc.totalQty += r.quantity;
    acc.uniqueParts.add(r.itemCode);
    acc.dates.add(r.date);
    return acc;
  }, { totalQty: 0, uniqueParts: new Set<string>(), dates: new Set<string>() });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Daily Demand Schedule</h2>
          <p className="text-muted-foreground text-sm">Manage daily production demand requirements.</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="date" 
            className="h-10 px-3 py-2 border rounded-md text-sm bg-background"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
          {isAdmin && (
            <button 
              onClick={() => setShowImportModal(true)}
              className="bg-secondary text-secondary-foreground border hover:bg-secondary/80 px-4 py-2 rounded-md font-medium text-sm flex items-center space-x-2 transition-colors"
            >
              <Upload size={16} />
              <span>Import Data</span>
            </button>
          )}
          {isAdmin && (
            <button 
              onClick={() => setShowForm(!showForm)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm flex items-center space-x-2 transition-colors"
            >
              <Plus size={16} />
              <span>Add Demand</span>
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="bg-card text-card-foreground border rounded-lg p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Calendar size={18} /> Record Daily Schedule
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Note: Use "Save Add" to add to existing quantity, or "Save Overwrite" to replace it entirely.</p>
          
          <form className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">Toy Name</label>
              <SearchableSelect
                options={items.filter((item: any) => item.itemCode !== item.itemName).map((item: any) => ({ value: item.itemName, label: item.itemName }))}
                value={formData.toyName}
                onChange={val => setFormData({...formData, toyName: val})}
                onAdd={(search) => setFormData({...formData, toyName: search})}
                placeholder="Select or enter Toy Name..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Master Carton</label>
              <SearchableSelect
                options={masterCartons.map((mc: any) => ({ value: mc.cartonCode, label: mc.cartonCode }))}
                value={formData.masterCarton}
                onChange={val => {
                  const mc = masterCartons.find((m: any) => m.cartonCode === val);
                  if (mc) {
                    const matchedToy = items.find((i: any) => i.id === mc.toyNameItemId);
                    setFormData({...formData, masterCarton: val, itemCode: mc.partNumberCode, toyName: matchedToy ? matchedToy.itemName : formData.toyName});
                  } else {
                    setFormData({...formData, masterCarton: val});
                  }
                }}
                onAdd={(search) => setFormData({...formData, masterCarton: search})}
                placeholder="Select or enter Master Carton..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Part Number</label>
              <SearchableSelect
                options={items.map((item: any) => ({ value: item.itemCode, label: item.itemCode }))}
                value={formData.itemCode}
                onChange={val => setFormData({...formData, itemCode: val})}
                onAdd={(search) => setFormData({...formData, itemCode: search})}
                placeholder="Select or enter Part Number..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <input 
                type="date" required
                className="w-full h-10 px-3 border rounded-md bg-background"
                value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Shift</label>
              <select 
                className="w-full h-10 px-3 border rounded-md bg-background"
                value={formData.shift} onChange={e => setFormData({...formData, shift: Number(e.target.value)})}
              >
                <option value={1}>Shift 1</option>
                <option value={2}>Shift 2</option>
                <option value={3}>Shift 3</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity Required</label>
              <input 
                type="number" required min="1"
                className="w-full h-10 px-3 border rounded-md bg-background"
                value={formData.quantity} onChange={e => setFormData({...formData, quantity: Number(e.target.value)})}
              />
            </div>
            
            <div className="md:col-span-2 lg:col-span-6 flex justify-end gap-3 mt-4">
              <button type="button" onClick={() => setShowForm(false)} className="h-10 border px-6 rounded-md font-medium hover:bg-muted transition-colors">Cancel</button>
              <button 
                type="button" 
                onClick={(e) => handleSubmit(e, 'add')} 
                disabled={upsertSchedule.isPending} 
                className="h-10 bg-green-600 hover:bg-green-700 text-white px-6 rounded-md font-medium flex items-center gap-2 transition-colors"
              >
                <Plus size={16} /> {upsertSchedule.isPending ? 'Saving...' : 'Save Add'}
              </button>
              <button 
                type="button" 
                onClick={(e) => handleSubmit(e, 'overwrite')} 
                disabled={upsertSchedule.isPending} 
                className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 px-6 rounded-md font-medium flex items-center gap-2 transition-colors"
              >
                <Save size={16} /> {upsertSchedule.isPending ? 'Saving...' : 'Save Overwrite'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-card text-card-foreground border rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/10 flex flex-wrap items-center gap-3">
          {isAdmin && selectedIds.length > 0 && (
            <button 
              onClick={handleDeleteSelected}
              disabled={bulkDeleteSchedule.isPending}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md font-medium text-sm flex items-center space-x-2 transition-colors mr-2"
            >
              <Trash2 size={16} />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          )}
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input 
              type="text"
              placeholder="Search Part Number or Toy Name..."
              className="w-full h-9 pl-9 pr-3 border rounded-md bg-background text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="h-9 px-3 border rounded-md bg-background text-sm min-w-[130px]"
            value={filterShift}
            onChange={(e) => setFilterShift(e.target.value)}
          >
            <option value="">All Shifts</option>
            <option value="1">Shift 1</option>
            <option value="2">Shift 2</option>
            <option value="3">Shift 3</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs font-medium">
              <tr>
                {isAdmin && (
                  <th className="px-6 py-3 w-12 text-center">
                    <input type="checkbox" checked={allFilteredSelected} onChange={handleSelectAll} className="rounded border-gray-300" />
                  </th>
                )}
                <th className="px-6 py-3">Toy Name</th>
                <th className="px-6 py-3">Master Carton</th>
                <th className="px-6 py-3">Part Number</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3 text-right">Shift 1</th>
                <th className="px-6 py-3 text-right">Shift 2</th>
                <th className="px-6 py-3 text-right">Shift 3</th>
                <th className="px-6 py-3 text-right">Target Demand</th>
                {isAdmin && <th className="px-6 py-3 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingSchedules ? (
                <tr><td colSpan={isAdmin ? 10 : 8} className="p-8 text-center">Loading...</td></tr>
              ) : groupedSchedules.length === 0 ? (
                <tr><td colSpan={isAdmin ? 10 : 8} className="p-8 text-center text-muted-foreground">No demand scheduled.</td></tr>
              ) : (
                groupedSchedules.map((group: any) => (
                  <tr key={group.id} className="hover:bg-muted/50 transition-colors">
                    {isAdmin && (
                      <td className="px-6 py-4 text-center">
                        <input 
                          type="checkbox" 
                          checked={group.ids.length > 0 && group.ids.every((id: string) => selectedIds.includes(id))} 
                          onChange={(e) => {
                            if (e.target.checked) {
                              const newIds = new Set([...selectedIds, ...group.ids]);
                              setSelectedIds(Array.from(newIds));
                            } else {
                              setSelectedIds(selectedIds.filter(id => !group.ids.includes(id)));
                            }
                          }} 
                          className="rounded border-gray-300"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 text-sm text-muted-foreground max-w-[200px] truncate" title={group.toyName}>{group.toyName}</td>
                    <td className="px-6 py-4 text-sm font-medium text-blue-600">{group.masterCarton}</td>
                    <td className="px-6 py-4 font-medium">{group.itemCode}</td>
                    <td className="px-6 py-4 text-sm">{group.date}</td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-red-500">{group.shift1.quantity > 0 ? group.shift1.quantity : '-'}</td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-red-500">{group.shift2.quantity > 0 ? group.shift2.quantity : '-'}</td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-red-500">{group.shift3.quantity > 0 ? group.shift3.quantity : '-'}</td>
                    <td className="px-6 py-4 text-right font-medium text-slate-700 dark:text-slate-300">{group.total}</td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setEditModal({
                              isOpen: true,
                              data: {
                                ids: group.ids,
                                date: group.date,
                                itemCode: group.itemCode,
                                toyName: group.toyName,
                                masterCarton: group.masterCarton,
                                shift1Qty: group.shift1.quantity,
                                shift2Qty: group.shift2.quantity,
                                shift3Qty: group.shift3.quantity,
                              }
                            })}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-md transition-colors"
                            title="Edit Record"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(group.ids)}
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors"
                            title="Delete Record"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card text-card-foreground border rounded-lg shadow-lg max-w-5xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-bold flex items-center gap-2"><Upload size={20} /> Import Daily Schedule</h3>
              <button onClick={() => { setShowImportModal(false); setImportData([]); }} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>
            
            <div className="p-6 flex-1 overflow-auto space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Upload the <strong>NEXT Week Daily Production Schedule</strong> Excel file (.xlsm / .xlsx). 
                  The system will automatically parse the <strong>FA_Attach</strong> sheet.
                </p>
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .xlsm, .csv" 
                  onChange={handleFileUpload} 
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                />
              </div>

              {importData.length > 0 && (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-primary">{importData.length}</div>
                      <div className="text-xs text-muted-foreground">Total Records</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-600">{importSummary.uniqueParts.size}</div>
                      <div className="text-xs text-muted-foreground">Unique Parts</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-600">{importSummary.dates.size}</div>
                      <div className="text-xs text-muted-foreground">Days</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-orange-600">{Math.round(importSummary.totalQty * 100) / 100}</div>
                      <div className="text-xs text-muted-foreground">Total Quantity</div>
                    </div>
                  </div>

                  {/* Search */}
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{filteredImportData.length} of {importData.length} records shown</span>
                    <div className="relative w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                      <input 
                        type="text" 
                        placeholder="Search by Part Number, Toy Name, Date..." 
                        className="w-full h-9 pl-9 pr-4 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={importSearch}
                        onChange={e => setImportSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Table */}
                  <div className="border rounded-md overflow-hidden max-h-[45vh] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted text-muted-foreground text-xs uppercase font-medium sticky top-0">
                        <tr>
                          <th className="px-4 py-3">Toy Name</th>
                          <th className="px-4 py-3">Master Carton</th>
                          <th className="px-4 py-3">Part Number</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3 text-right">Shift 1</th>
                          <th className="px-4 py-3 text-right">Shift 2</th>
                          <th className="px-4 py-3 text-right">Shift 3</th>
                          <th className="px-4 py-3 text-right">Target Demand</th>
                          <th className="px-4 py-3 text-center w-16">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {groupedImportData.map((group: any) => {
                          const updateImportQty = (shift: number, qty: number) => {
                            const newData = [...importData];
                            const idx = newData.findIndex(r => r.date === group.date && r.itemCode === group.itemCode && r.shift === shift && (r.masterCarton || '-') === group.masterCarton);
                            if (idx >= 0) {
                              if (qty === 0) newData.splice(idx, 1);
                              else newData[idx] = { ...newData[idx], quantity: qty };
                            } else if (qty > 0) {
                              newData.push({
                                id: `manual-${Date.now()}-${shift}`,
                                toyName: group.toyName,
                                masterCarton: group.masterCarton === '-' ? '' : group.masterCarton,
                                itemCode: group.itemCode,
                                date: group.date,
                                shift,
                                quantity: qty
                              });
                            }
                            setImportData(newData);
                          };
                          
                          return (
                            <tr key={group.id} className="hover:bg-muted/50">
                              <td className="px-4 py-2 text-xs text-muted-foreground max-w-[160px] truncate" title={group.toyName}>{group.toyName || '-'}</td>
                              <td className="px-4 py-2 text-sm font-medium text-blue-600">{group.masterCarton || '-'}</td>
                              <td className="px-4 py-2 font-medium">{group.itemCode}</td>
                              <td className="px-4 py-2 text-xs">{group.date}</td>
                              <td className="px-4 py-2 text-right">
                                <input type="number" min="0" className="w-16 h-8 px-1 border rounded text-right bg-background" value={group.shift1.quantity || 0} onChange={e => updateImportQty(1, Number(e.target.value))} />
                              </td>
                              <td className="px-4 py-2 text-right">
                                <input type="number" min="0" className="w-16 h-8 px-1 border rounded text-right bg-background" value={group.shift2.quantity || 0} onChange={e => updateImportQty(2, Number(e.target.value))} />
                              </td>
                              <td className="px-4 py-2 text-right">
                                <input type="number" min="0" className="w-16 h-8 px-1 border rounded text-right bg-background" value={group.shift3.quantity || 0} onChange={e => updateImportQty(3, Number(e.target.value))} />
                              </td>
                              <td className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">{group.total}</td>
                              <td className="px-4 py-2 text-center">
                                <button 
                                  onClick={() => {
                                    const toDelete = new Set([group.shift1.id, group.shift2.id, group.shift3.id].filter(Boolean));
                                    setImportData(importData.filter(r => !toDelete.has(r.id)));
                                  }}
                                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors"
                                  title="Delete Record"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            
            <div className="p-6 border-t flex justify-end gap-3 bg-muted/10">
              <button 
                onClick={() => { setShowImportModal(false); setImportData([]); }}
                className="h-10 border px-6 rounded-md font-medium hover:bg-muted text-sm transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleBulkSubmit('add')} 
                disabled={bulkUpsertSchedule.isPending || importData.length === 0} 
                className="h-10 bg-green-600 hover:bg-green-700 text-white px-6 rounded-md font-medium flex items-center gap-2 disabled:opacity-50 text-sm transition-colors"
              >
                <Plus size={16} /> {bulkUpsertSchedule.isPending ? 'Saving...' : 'Save (Add)'}
              </button>
              <button 
                onClick={() => handleBulkSubmit('overwrite')} 
                disabled={bulkUpsertSchedule.isPending || importData.length === 0} 
                className="h-10 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white px-6 rounded-md font-medium flex items-center gap-2 disabled:opacity-50 text-sm transition-colors"
              >
                <Save size={16} /> {bulkUpsertSchedule.isPending ? 'Saving...' : 'Save Overwrite'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Modal */}
      {editModal.isOpen && editModal.data && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card text-card-foreground border rounded-lg shadow-lg max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">Edit Daily Schedule</h3>
              <button 
                type="button" 
                onClick={() => setEditModal({ isOpen: false, data: null })}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Part Number</label>
                <div className="font-semibold">{editModal.data.itemCode} - {editModal.data.toyName}</div>
                <div className="text-sm text-muted-foreground">Date: {editModal.data.date}</div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Shift 1</label>
                  <input 
                    type="number" min="0"
                    className="w-full h-10 px-3 border rounded-md bg-background"
                    value={editModal.data.shift1Qty} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, shift1Qty: Number(e.target.value)}}))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Shift 2</label>
                  <input 
                    type="number" min="0"
                    className="w-full h-10 px-3 border rounded-md bg-background"
                    value={editModal.data.shift2Qty} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, shift2Qty: Number(e.target.value)}}))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Shift 3</label>
                  <input 
                    type="number" min="0"
                    className="w-full h-10 px-3 border rounded-md bg-background"
                    value={editModal.data.shift3Qty} onChange={e => setEditModal(prev => ({...prev, data: {...prev.data, shift3Qty: Number(e.target.value)}}))}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setEditModal({ isOpen: false, data: null })} className="h-10 border px-4 rounded-md font-medium hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={bulkUpsertSchedule.isPending} className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 px-4 rounded-md font-medium flex items-center gap-2 transition-colors">
                  <Save size={16} /> {bulkUpsertSchedule.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
