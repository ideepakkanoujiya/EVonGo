
'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PlusCircle, BookOpen } from 'lucide-react';
import type { ServiceRecord } from '@/lib/types';

const initialRecords: ServiceRecord[] = [];

export default function VehicleLogPage() {
  const [records, setRecords] = useState(initialRecords);
  const [isDialogOpen, setDialogOpen] = useState(false);

  const addRecord = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const newRecord: ServiceRecord = {
      id: (records.length + 1).toString(),
      date: formData.get('date') as string,
      service: formData.get('service') as string,
      cost: Number(formData.get('cost')),
      notes: formData.get('notes') as string,
    };
    setRecords([newRecord, ...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setDialogOpen(false);
  };
  
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
            <h1 className="text-3xl font-bold font-headline">Vehicle Service Log</h1>
            <p className="text-muted-foreground">
              Keep a detailed digital logbook of all your {`EV's`} maintenance.
            </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
                <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Record
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add New Service Record</DialogTitle>
                    <DialogDescription>
                        Enter the details of the service or maintenance performed.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={addRecord}>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="date" className="text-right">Date</Label>
                            <Input id="date" name="date" type="date" className="col-span-3" required />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="service" className="text-right">Service</Label>
                            <Input id="service" name="service" placeholder="e.g., Annual Checkup" className="col-span-3" required />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="cost" className="text-right">Cost (₹)</Label>
                            <Input id="cost" name="cost" type="number" placeholder="e.g., 5000" className="col-span-3" required/>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="notes" className="text-right">Notes</Label>
                            <Textarea id="notes" name="notes" placeholder="Any additional details..." className="col-span-3" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit">Save Record</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <div className="text-center p-12">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">No service records yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Click {`"Add Record"`} to log your first service.
              </p>
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Service / Repair</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Cost (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{new Date(record.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</TableCell>
                  <TableCell>{record.service}</TableCell>
                  <TableCell className="text-muted-foreground">{record.notes}</TableCell>
                  <TableCell className="text-right">₹{record.cost.toLocaleString('en-IN')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
