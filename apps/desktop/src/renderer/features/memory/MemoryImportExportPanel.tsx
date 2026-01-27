import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui';
import { Button } from '@renderer/components/ui';
import { Label } from '@renderer/components/ui';
import { Textarea } from '@renderer/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@renderer/components/ui';
import { Input } from '@renderer/components/ui';
import { Badge } from '@renderer/components/ui';
import {
  Download,
  Upload,
  FileJson,
  FileText,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useMemoryStore } from '@renderer/stores/memoryStore';
import type { MemoryType, MemoryExportFilter } from '@preload/api';

/**
 * Memory type options for filter.
 */
const memoryTypes: { value: MemoryType; label: string }[] = [
  { value: 'note', label: 'Notes' },
  { value: 'conversation', label: 'Conversations' },
  { value: 'code', label: 'Code' },
  { value: 'document', label: 'Documents' },
  { value: 'task', label: 'Tasks' },
  { value: 'reference', label: 'References' },
];

/**
 * Memory Import/Export Panel component.
 */
export function MemoryImportExportPanel() {
  const {
    statistics,
    isExporting,
    isImporting,
    exportMemories,
    importMemories,
    fetchStatistics,
  } = useMemoryStore();

  // Export state
  const [exportFormat, setExportFormat] = useState<'json' | 'markdown'>('json');
  const [exportFilter, setExportFilter] = useState<MemoryExportFilter>({});
  const [exportedData, setExportedData] = useState<string>('');
  const [showExportResult, setShowExportResult] = useState(false);

  // Import state
  const [importFormat, setImportFormat] = useState<'json' | 'markdown'>('json');
  const [importData, setImportData] = useState<string>('');
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Handle export
  const handleExport = async () => {
    try {
      const data = await exportMemories(exportFormat, exportFilter);
      setExportedData(data);
      setShowExportResult(true);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // Handle download
  const handleDownload = () => {
    const blob = new Blob([exportedData], {
      type: exportFormat === 'json' ? 'application/json' : 'text/markdown',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memories-export-${Date.now()}.${exportFormat === 'json' ? 'json' : 'md'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle import
  const handleImport = async () => {
    if (!importData.trim()) return;

    try {
      const result = await importMemories(importData, importFormat);
      setImportResult(result);
      // Refresh statistics after import
      await fetchStatistics();
    } catch (error) {
      setImportResult({
        imported: 0,
        skipped: 0,
        errors: [String(error)],
      });
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setImportData(content);

      // Auto-detect format from file extension
      if (file.name.endsWith('.json')) {
        setImportFormat('json');
      } else if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
        setImportFormat('markdown');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Memories
          </CardTitle>
          <CardDescription>
            Export your memories to JSON or Markdown format for backup or sharing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Format selection */}
          <div className="space-y-2">
            <Label>Export Format</Label>
            <Select
              value={exportFormat}
              onValueChange={(v) => setExportFormat(v as 'json' | 'markdown')}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">
                  <div className="flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    JSON
                  </div>
                </SelectItem>
                <SelectItem value="markdown">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Markdown
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filters */}
          <div className="space-y-4 border rounded-lg p-4">
            <h4 className="text-sm font-medium">Filters (Optional)</h4>

            {/* Type filter */}
            <div className="space-y-2">
              <Label>Memory Type</Label>
              <Select
                value={exportFilter.type || 'all'}
                onValueChange={(v) =>
                  setExportFilter({
                    ...exportFilter,
                    type: v === 'all' ? undefined : (v as MemoryType),
                  })
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {memoryTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Importance filter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Minimum Importance</Label>
                <span className="text-sm text-muted-foreground">
                  {Math.round((exportFilter.minImportance || 0) * 100)}%
                </span>
              </div>
              <Input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={exportFilter.minImportance || 0}
                onChange={(e) =>
                  setExportFilter({ ...exportFilter, minImportance: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
          </div>

          {/* Export button */}
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export{' '}
                {statistics?.totalCount
                  ? `(~${statistics.totalCount} memories)`
                  : ''}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Export Result Dialog */}
      <Dialog open={showExportResult} onOpenChange={setShowExportResult}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              Export Complete
            </DialogTitle>
            <DialogDescription>
              Your memories have been exported. You can copy the content or
              download as a file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={exportedData}
              readOnly
              className="h-64 font-mono text-xs"
            />
            <div className="text-sm text-muted-foreground">
              {exportedData.length.toLocaleString()} characters
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => navigator.clipboard.writeText(exportedData)}
            >
              Copy to Clipboard
            </Button>
            <Button onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Memories
          </CardTitle>
          <CardDescription>
            Import memories from a JSON or Markdown file
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Format selection */}
          <div className="space-y-2">
            <Label>Import Format</Label>
            <Select
              value={importFormat}
              onValueChange={(v) => setImportFormat(v as 'json' | 'markdown')}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">
                  <div className="flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    JSON
                  </div>
                </SelectItem>
                <SelectItem value="markdown">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Markdown
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <Label>Upload File</Label>
            <input
              type="file"
              accept=".json,.md,.markdown"
              onChange={handleFileUpload}
              className="block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90
                cursor-pointer"
            />
          </div>

          {/* Or paste content */}
          <div className="space-y-2">
            <Label>Or Paste Content</Label>
            <Textarea
              placeholder="Paste your exported memories here..."
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              className="h-32 font-mono text-xs"
            />
          </div>

          {/* Import button */}
          <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
            <DialogTrigger asChild>
              <Button disabled={!importData.trim() || isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import Memories
                  </>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Import</DialogTitle>
                <DialogDescription>
                  This will import memories from the pasted content. Duplicate
                  memories (with the same content hash) will be skipped.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowImportDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    await handleImport();
                    setShowImportDialog(false);
                  }}
                >
                  Import
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Import Result */}
      {importResult && (
        <Card
          className={
            importResult.errors.length > 0
              ? 'border-destructive'
              : 'border-green-500'
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importResult.errors.length > 0 ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <Check className="h-5 w-5 text-green-500" />
              )}
              Import Result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-4">
              <Badge variant="secondary">
                {importResult.imported} imported
              </Badge>
              <Badge variant="outline">{importResult.skipped} skipped</Badge>
              {importResult.errors.length > 0 && (
                <Badge variant="destructive">
                  {importResult.errors.length} errors
                </Badge>
              )}
            </div>
            {importResult.errors.length > 0 && (
              <div className="mt-2 text-sm text-destructive">
                <p className="font-medium">Errors:</p>
                <ul className="list-disc list-inside">
                  {importResult.errors.slice(0, 5).map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                  {importResult.errors.length > 5 && (
                    <li>...and {importResult.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default MemoryImportExportPanel;
