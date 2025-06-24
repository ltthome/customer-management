<script setup lang="ts">
import { ref, onMounted, computed, toRaw } from 'vue';
import { db, type Customer, CustomerType } from '../db';
import { liveQuery } from 'dexie';

const customers = ref<Customer[]>([]);
const newCustomer = ref<Omit<Customer, 'id'>>({
  fullName: '',
  phone: '',
  note: '',
  customSearchField1: '',
  type: CustomerType.NEW,
  lastCall: undefined,
  nextCall: undefined,
});
const editingCustomer = ref<Customer | null>(null);
const searchId = ref('');
const searchFullName = ref('');
const searchPhone = ref('');
const searchNote = ref('');
const searchCustomField = ref('');
const searchType = ref<CustomerType | ''>('');
const searchLastCall = ref('');
const searchNextCall = ref('');
const sortKey = ref<keyof Customer | ''>('');
const sortOrder = ref<'asc' | 'desc'>('asc');

const safeFormatForInput = (d: string | Date | undefined | null): string => {
  if (!d) return '';
  // Ensure we're working with a Date object
  const date = d instanceof Date ? d : new Date(d);
  // Check if the date is valid
  if (isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

const newLastCall = computed({
  get: () => safeFormatForInput(newCustomer.value.lastCall),
  set: (val) => newCustomer.value.lastCall = val ? new Date(val) : undefined,
});
const newNextCall = computed({
    get: () => safeFormatForInput(newCustomer.value.nextCall),
    set: (val) => newCustomer.value.nextCall = val ? new Date(val) : undefined,
});

const editingLastCall = computed({
    get: () => safeFormatForInput(editingCustomer.value?.lastCall),
    set: (val) => {
        if (editingCustomer.value) {
            editingCustomer.value.lastCall = val ? new Date(val) : undefined;
        }
    },
});

const editingNextCall = computed({
    get: () => safeFormatForInput(editingCustomer.value?.nextCall),
    set: (val) => {
        if (editingCustomer.value) {
            editingCustomer.value.nextCall = val ? new Date(val) : undefined;
        }
    },
});

const filteredCustomers = computed(() => {
  return customers.value.filter(customer => {
    const idMatch = searchId.value ? String(customer.id ?? '').includes(searchId.value) : true;
    const fullNameMatch = customer.fullName.toLowerCase().includes(searchFullName.value.toLowerCase());
    const phoneMatch = customer.phone.toLowerCase().includes(searchPhone.value.toLowerCase());
    const noteMatch = customer.note.toLowerCase().includes(searchNote.value.toLowerCase());
    const customFieldMatch = customer.customSearchField1.toLowerCase().includes(searchCustomField.value.toLowerCase());
    const typeMatch = searchType.value ? customer.type === searchType.value : true;

    const lastCallMatch = (() => {
      if (!searchLastCall.value) return true;
      if (!customer.lastCall) return false;
      const customerDate = new Date(customer.lastCall).toISOString().split('T')[0];
      return customerDate === searchLastCall.value;
    })();

    const nextCallMatch = (() => {
      if (!searchNextCall.value) return true;
      if (!customer.nextCall) return false;
      const customerDate = new Date(customer.nextCall).toISOString().split('T')[0];
      return customerDate === searchNextCall.value;
    })();

    return idMatch && fullNameMatch && phoneMatch && noteMatch && customFieldMatch && typeMatch && lastCallMatch && nextCallMatch;
  });
});

const sortedAndFilteredCustomers = computed(() => {
  const customersToSort = [...filteredCustomers.value];

  if (sortKey.value) {
    customersToSort.sort((a, b) => {
      const key = sortKey.value as keyof Customer;
      let valA = a[key];
      let valB = b[key];

      // Place nulls and undefined at the end
      if (valA == null) return 1;
      if (valB == null) return -1;
      
      if (key === 'lastCall' || key === 'nextCall') {
          return new Date(valA).getTime() - new Date(valB).getTime();
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return valA - valB;
      }

      return String(valA).localeCompare(String(valB));
    });

    if (sortOrder.value === 'desc') {
      customersToSort.reverse();
    }
  }

  return customersToSort;
});

onMounted(() => {
  const query = liveQuery(() => db.customers.toArray());
  query.subscribe({
    next: (result) => (customers.value = result),
    error: (error) => console.error(error),
  });
});

const addCustomer = async () => {
  if (!newCustomer.value.fullName || !newCustomer.value.phone) {
    alert('Full Name and Phone are required.');
    return;
  }
  await db.customers.add(toRaw(newCustomer.value));
  newCustomer.value = {
    fullName: '',
    phone: '',
    note: '',
    customSearchField1: '',
    type: CustomerType.NEW,
    lastCall: undefined,
    nextCall: undefined,
  };
};

const sortBy = (key: keyof Customer) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
};

const startEditing = (customer: Customer) => {
  editingCustomer.value = { ...customer };
};

const updateCustomer = async () => {
  if (editingCustomer.value) {
    await db.customers.update(editingCustomer.value.id!, toRaw(editingCustomer.value));
    editingCustomer.value = null;
  }
};

const cancelEdit = () => {
  editingCustomer.value = null;
};

const deleteCustomer = async (id: number) => {
  if (confirm('Are you sure you want to delete this customer?')) {
    await db.customers.delete(id);
  }
};

const exportData = async () => {
  const allCustomers = await db.customers.toArray();
  const dataStr = JSON.stringify(allCustomers, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'customers.json';
  link.click();
  URL.revokeObjectURL(url);
};

const importData = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedCustomers = (JSON.parse(e.target?.result as string) as any[]).map(c => {
          return {
            ...c,
            lastCall: c.lastCall ? new Date(c.lastCall) : undefined,
            nextCall: c.nextCall ? new Date(c.nextCall) : undefined,
          };
        });
        if (confirm('This will replace all current customers. Are you sure?')) {
          await db.customers.clear();
          await db.customers.bulkAdd(importedCustomers);
        }
      } catch (error) {
        alert('Invalid JSON file.');
        console.error(error);
      }
    };
    reader.readAsText(file);
  }
};
</script>

<template>
  <main>

    <div>
      <h2>Customer List</h2>

      <table>
        <thead>
          <tr>
            <th @click="sortBy('id')" class="sortable-header">ID <span v-if="sortKey === 'id'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('fullName')" class="sortable-header">Full Name <span v-if="sortKey === 'fullName'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('phone')" class="sortable-header">Phone <span v-if="sortKey === 'phone'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('note')" class="sortable-header">Note <span v-if="sortKey === 'note'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('customSearchField1')" class="sortable-header">Custom Search <span v-if="sortKey === 'customSearchField1'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('type')" class="sortable-header">Type <span v-if="sortKey === 'type'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('lastCall')" class="sortable-header">Last Call <span v-if="sortKey === 'lastCall'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('nextCall')" class="sortable-header">Next Call <span v-if="sortKey === 'nextCall'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th>Actions</th>
          </tr>
          <tr>
            <td><input v-model="searchId" placeholder="Search ID..." /></td>
            <td><input v-model="searchFullName" placeholder="Search Name..." /></td>
            <td><input v-model="searchPhone" placeholder="Search Phone..." /></td>
            <td><input v-model="searchNote" placeholder="Search Note..." /></td>
            <td><input v-model="searchCustomField" placeholder="Search Custom..." /></td>
            <td>
              <select v-model="searchType">
                <option value="">All Types</option>
                <option v-for="type in Object.values(CustomerType)" :key="type" :value="type">
                  {{ type }}
                </option>
              </select>
            </td>
            <td><input type="date" v-model="searchLastCall" /></td>
            <td><input type="date" v-model="searchNextCall" /></td>
            <td></td>
          </tr>
        </thead>
        <tbody>
          <tr v-for="customer in sortedAndFilteredCustomers" :key="customer.id">
            <td>{{ customer.id }}</td>
            <td>{{ customer.fullName }}</td>
            <td>{{ customer.phone }}</td>
            <td>{{ customer.note }}</td>
            <td>{{ customer.customSearchField1 }}</td>
            <td>{{ customer.type }}</td>
            <td>{{ customer.lastCall ? new Date(customer.lastCall).toLocaleDateString() : '' }}</td>
            <td>{{ customer.nextCall ? new Date(customer.nextCall).toLocaleDateString() : '' }}</td>
            <td>
              <button @click="startEditing(customer)">Edit</button>
              <button @click="deleteCustomer(customer.id!)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- Edit Customer Form, shown when a customer is being edited -->
    <div v-if="editingCustomer">
      <h2>Edit Customer</h2>
      <form @submit.prevent="updateCustomer">
        <input v-model="editingCustomer.fullName" placeholder="Full Name" />
        <input v-model="editingCustomer.phone" placeholder="Phone" />
        <textarea v-model="editingCustomer.note" placeholder="Note"></textarea>
        <input v-model="editingCustomer.customSearchField1" placeholder="Custom Search" />
        <select v-model="editingCustomer.type">
          <option v-for="type in Object.values(CustomerType)" :key="type" :value="type">
            {{ type }}
          </option>
        </select>
        <input type="date" v-model="editingLastCall" />
        <input type="date" v-model="editingNextCall" />
        <button type="submit">Update Customer</button>
        <button @click="cancelEdit" type="button">Cancel Edit</button>
      </form>
    </div>

    <!-- Add Customer Form, shown when not editing -->
    <div v-else>
      <h2>New Customer</h2>
      <form @submit.prevent="addCustomer">
        <input v-model="newCustomer.fullName" placeholder="Full Name" />
        <input v-model="newCustomer.phone" placeholder="Phone" />
        <textarea v-model="newCustomer.note" placeholder="Note"></textarea>
        <input v-model="newCustomer.customSearchField1" placeholder="Custom Search" />
        <select v-model="newCustomer.type">
          <option v-for="type in Object.values(CustomerType)" :key="type" :value="type">
            {{ type }}
          </option>
        </select>
        <input type="date" v-model="newLastCall" />
        <input type="date" v-model="newNextCall" />
        <button type="submit">Add Customer</button>

      </form>
    </div>

    <div>
      <button @click="exportData">Export</button>
      <input type="file" @change="importData" accept=".json" style="display: none;" id="import-file" />
      <button onclick="document.getElementById('import-file').click()">Import</button>
    </div>

  </main>
</template>

<style scoped>
  .sortable-header {
    cursor: pointer;
    user-select: none;
  }
  .sortable-header:hover {
    background-color: #f2f2f2;
  }
  table {
    table-layout: fixed;
    width: 100%;
  }
  table th:first-child,
  table td:first-child {
    width: 4%; /* Makes the first column narrower */
  }
  table input, table select {
    width: 90%;
  }
</style>
