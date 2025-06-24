<script setup lang="ts">
import { ref, onMounted, computed, toRaw } from 'vue';
import { db, type Customer, CustomerType } from '../db';
import { liveQuery } from 'dexie';
import { useTheme } from '../composables/useTheme';

const { theme, toggleTheme } = useTheme();

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

    <div id="customer-list-container">
      <table id="customer-table">
        <thead>
          <tr>
            <th @click="sortBy('id')" class="sortable-header" id="header-id">ID <span v-if="sortKey === 'id'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('fullName')" class="sortable-header" id="header-fullName">Full Name <span v-if="sortKey === 'fullName'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('phone')" class="sortable-header" id="header-phone">Phone <span v-if="sortKey === 'phone'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('note')" class="sortable-header" id="header-note">Note <span v-if="sortKey === 'note'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('customSearchField1')" class="sortable-header" id="header-customSearchField1">Custom Search <span v-if="sortKey === 'customSearchField1'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('type')" class="sortable-header" id="header-type">Type <span v-if="sortKey === 'type'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('lastCall')" class="sortable-header" id="header-lastCall">Last Call <span v-if="sortKey === 'lastCall'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th @click="sortBy('nextCall')" class="sortable-header" id="header-nextCall">Next Call <span v-if="sortKey === 'nextCall'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
            <th class="actions-header" id="header-actions">Actions</th>
          </tr>
          <tr>
            <td><input v-model="searchId" placeholder="..." id="search-id-input"/></td>
            <td><input v-model="searchFullName" placeholder="..." id="search-fullName-input"/></td>
            <td><input v-model="searchPhone" placeholder="..." id="search-phone-input"/></td>
            <td><input v-model="searchNote" placeholder="..." id="search-note-input"/></td>
            <td><input v-model="searchCustomField" placeholder="..." id="search-customField-input"/></td>
            <td>
              <select v-model="searchType" id="search-type-select">
                <option value=""></option>
                <option v-for="type in Object.values(CustomerType)" :key="type" :value="type">
                  {{ type }}
                </option>
              </select>
            </td>
            <td><input type="date" v-model="searchLastCall" id="search-lastCall-input"/></td>
            <td><input type="date" v-model="searchNextCall" id="search-nextCall-input"/></td>
            <td></td>
          </tr>
        </thead>
        <tbody>
          <tr v-for="customer in sortedAndFilteredCustomers" :key="customer.id" :id="`customer-row-${customer.id}`">
            <td>{{ customer.id }}</td>
            <td>{{ customer.fullName }}</td>
            <td>{{ customer.phone }}</td>
            <td>{{ customer.note }}</td>
            <td>{{ customer.customSearchField1 }}</td>
            <td>{{ customer.type }}</td>
            <td>{{ customer.lastCall ? new Date(customer.lastCall).toLocaleDateString() : '' }}</td>
            <td>{{ customer.nextCall ? new Date(customer.nextCall).toLocaleDateString() : '' }}</td>
            <td>
              <button @click="startEditing(customer)" :id="`edit-customer-btn-${customer.id}`">Edit</button>
              <button @click="deleteCustomer(customer.id!)" :id="`delete-customer-btn-${customer.id}`">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div id="data-management-buttons">
        <button @click="exportData" id="export-data-btn">Export</button>
        <input type="file" @change="importData" accept=".json" style="display: none;" id="import-file-input" />
        <button onclick="document.getElementById('import-file-input').click()" id="import-data-btn">Import</button>
        <button @click="toggleTheme" id="theme-toggle-btn">
          {{ theme === 'light' ? 'Dark' : 'Light' }} Mode
        </button>
      </div>
    </div>
    <!-- Edit Customer Form, shown when a customer is being edited -->
    <div v-if="editingCustomer" id="edit-customer-form-container" class="bottom-form-container">
      <form @submit.prevent="updateCustomer" id="edit-customer-form">
        <input v-model="editingCustomer.fullName" placeholder="Full Name" id="edit-fullName-input"/>
        <input v-model="editingCustomer.phone" placeholder="Phone" id="edit-phone-input"/>
        <input type="text" v-model="editingCustomer.note" placeholder="Note" id="edit-note-input"/>
        <input v-model="editingCustomer.customSearchField1" placeholder="Custom Search" id="edit-customSearch-input"/>
        <select v-model="editingCustomer.type" id="edit-type-select">
          <option v-for="type in Object.values(CustomerType)" :key="type" :value="type">
            {{ type }}
          </option>
        </select>
        <input type="date" v-model="editingLastCall" id="edit-lastCall-input"/>
        <input type="date" v-model="editingNextCall" id="edit-nextCall-input"/>
        <button type="submit" id="update-customer-btn">Update</button>
        <button @click="cancelEdit" type="button" id="cancel-edit-btn">Cancel</button>
      </form>
    </div>

    <!-- Add Customer Form, shown when not editing -->
    <div v-else id="add-customer-form-container" class="bottom-form-container">
      <form @submit.prevent="addCustomer" id="add-customer-form">
        <input v-model="newCustomer.fullName" placeholder="Full Name" id="new-fullName-input"/>
        <input v-model="newCustomer.phone" placeholder="Phone" id="new-phone-input"/>
        <input type="text" v-model="newCustomer.note" placeholder="Note" id="new-note-input"/>
        <input v-model="newCustomer.customSearchField1" placeholder="Custom Search" id="new-customSearch-input"/>
        <select v-model="newCustomer.type" id="new-type-select">
          <option v-for="type in Object.values(CustomerType)" :key="type" :value="type">
            {{ type }}
          </option>
        </select>
        <input type="date" v-model="newLastCall" id="new-lastCall-input"/>
        <input type="date" v-model="newNextCall" id="new-nextCall-input"/>
        <button type="submit" id="add-customer-btn">Add Customer</button>
      </form>
    </div>

  </main>
</template>

<style scoped>
  main {
    padding: 0.5rem;
    background-color: var(--color-background);
    color: var(--color-text);
  }
  h2 {
    margin-bottom: 0.5rem;
    font-size: 1.25rem;
  }
  form {
    margin-bottom: 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  input, select, button {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--color-border);
    font-size: 0.9rem;
    background-color: var(--color-input-bg);
    color: var(--color-text);
  }
  button {
    cursor: pointer;
    background-color: var(--color-button-bg);
    color: var(--color-button-text);
  }
  table {
    border-collapse: collapse;
    margin-top: 1rem;
  }
  th, td {
    border: 1px solid var(--color-border);
    padding: 2px 4px;
    text-align: left;
  }
  th {
    background-color: var(--color-table-header-bg);
    color: var(--color-table-header-text);
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.85rem;
    letter-spacing: 0.05em;
  }

  .actions-header {
    text-align: center;
  }

  td:last-child {
    text-align: center;
  }

  td:last-child button {
    margin: 0 2px;
    padding: 2px 4px;
  }

  .sortable-header {
    cursor: pointer;
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
    width: 3%; /* ID column */
  }
  table th:nth-child(2),
  table td:nth-child(2) {
    width: 10%; /* Full Name column */
  }
  table th:nth-child(3),
  table td:nth-child(3) {
    width: 8%; /* Phone column */
  }
  table th:nth-child(4),
  table td:nth-child(4) {
    width: 35%; /* Note column */
  }
  table th:nth-child(5),
  table td:nth-child(5) {
    width: 12%; /* Custom Search column */
  }
  table th:nth-child(6),
  table td:nth-child(6) {
    width: 4%; /* Type column */
  }
  table th:nth-child(7),
  table td:nth-child(7) {
    width: 6%; /* Last Call column */
  }
  table th:nth-child(8),
  table td:nth-child(8) {
    width: 6%; /* Next Call column */
  }
  table th:nth-child(9),
  table td:nth-child(9) {
    width: 8%; /* Actions column */
  }
  table input, table select {
    width: 90%;
  }

  #customer-list-container {
    padding-bottom: 20rem; /* provide space for the fixed form at the bottom */
  }

  .bottom-form-container {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.5rem 1rem 0 1.5rem;
    background: var(--color-background);
    border-top: 1px solid var(--color-border);
    box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
    z-index: 1000;
  }

  #data-management-buttons {
    margin-top: 1rem;
    display: flex;
    gap: 0.5rem;
    justify-content: flex-start;
  }

  /* Form input widths to match table columns */
  .bottom-form-container form {
    align-items: center;
  }
  
  .bottom-form-container form > * {
    margin-bottom: 0.5rem; /* Add some space below each input */
  }

  #edit-fullName-input, #new-fullName-input { width: 10%; }
  #edit-phone-input, #new-phone-input { width: 8%; }
  #edit-note-input, #new-note-input { width: 32%; }
  #edit-customSearch-input, #new-customSearch-input { width: 12%; }
  #edit-type-select, #new-type-select { width: 5%; }
  #edit-lastCall-input, #new-lastCall-input { width: 9%; }
  #edit-nextCall-input, #new-nextCall-input { width: 9%; }
</style>
