<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
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
const searchFullName = ref('');
const searchPhone = ref('');
const searchCustomField = ref('');
const searchType = ref<CustomerType | ''>('');

const newLastCall = computed({
  get: () => newCustomer.value.lastCall ? newCustomer.value.lastCall.toISOString().split('T')[0] : '',
  set: (val) => newCustomer.value.lastCall = val ? new Date(val) : undefined,
});
const newNextCall = computed({
    get: () => newCustomer.value.nextCall ? newCustomer.value.nextCall.toISOString().split('T')[0] : '',
    set: (val) => newCustomer.value.nextCall = val ? new Date(val) : undefined,
});

const editingLastCall = computed({
    get: () => editingCustomer.value?.lastCall ? editingCustomer.value.lastCall.toISOString().split('T')[0] : '',
    set: (val) => {
        if (editingCustomer.value) {
            editingCustomer.value.lastCall = val ? new Date(val) : undefined;
        }
    },
});

const editingNextCall = computed({
    get: () => editingCustomer.value?.nextCall ? editingCustomer.value.nextCall.toISOString().split('T')[0] : '',
    set: (val) => {
        if (editingCustomer.value) {
            editingCustomer.value.nextCall = val ? new Date(val) : undefined;
        }
    },
});

const filteredCustomers = computed(() => {
  return customers.value.filter(customer => {
    const fullNameMatch = customer.fullName.toLowerCase().includes(searchFullName.value.toLowerCase());
    const phoneMatch = customer.phone.toLowerCase().includes(searchPhone.value.toLowerCase());
    const customFieldMatch = customer.customSearchField1.toLowerCase().includes(searchCustomField.value.toLowerCase());
    const typeMatch = searchType.value ? customer.type === searchType.value : true;
    return fullNameMatch && phoneMatch && customFieldMatch && typeMatch;
  });
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
  await db.customers.add(newCustomer.value);
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

const startEditing = (customer: Customer) => {
  editingCustomer.value = { ...customer };
};

const updateCustomer = async () => {
  if (editingCustomer.value) {
    await db.customers.update(editingCustomer.value.id!, editingCustomer.value);
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
        const importedCustomers = JSON.parse(e.target?.result as string) as Customer[];
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
      <button @click="exportData">Export to JSON</button>
      <input type="file" @change="importData" accept=".json" style="display: none;" id="import-file" />
      <button onclick="document.getElementById('import-file').click()">Import from JSON</button>
    </div>

    <!-- Edit Customer Form -->
    <div v-if="editingCustomer">
      <h2>Edit Customer</h2>
      <form @submit.prevent="updateCustomer()">
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
        <button type="submit">Update</button>
        <button @click="cancelEdit" type="button">Cancel</button>
      </form>
    </div>

    <!-- Add Customer Form -->
    <div v-else>
      <h2>Add Customer</h2>
      <form @submit.prevent="addCustomer()">
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
        <button type="submit">Add</button>
      </form>
    </div>

    <div>
      <h2>Customer List</h2>

      <div>
        <h3>Search</h3>
        <input v-model="searchFullName" placeholder="Search Full Name" />
        <input v-model="searchPhone" placeholder="Search Phone" />
        <input v-model="searchCustomField" placeholder="Search Custom Field" />
        <select v-model="searchType">
          <option value="">All Types</option>
          <option v-for="type in Object.values(CustomerType)" :key="type" :value="type">
            {{ type }}
          </option>
        </select>
      </div>

      <table>
        <thead>
          <tr>
            <th>Full Name</th>
            <th>Phone</th>
            <th>Note</th>
            <th>Custom Search</th>
            <th>Type</th>
            <th>Last Call</th>
            <th>Next Call</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="customer in filteredCustomers" :key="customer.id">
            <td>{{ customer.fullName }}</td>
            <td>{{ customer.phone }}</td>
            <td>{{ customer.note }}</td>
            <td>{{ customer.customSearchField1 }}</td>
            <td>{{ customer.type }}</td>
            <td>{{ customer.lastCall?.toLocaleDateString() }}</td>
            <td>{{ customer.nextCall?.toLocaleDateString() }}</td>
            <td>
              <button @click="startEditing(customer)">Edit</button>
              <button @click="deleteCustomer(customer.id!)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>
