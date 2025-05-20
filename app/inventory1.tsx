import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../firebaseConfig';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  addDoc,
  arrayUnion,
  getDoc,
  writeBatch,
} from 'firebase/firestore';
import { FontAwesome } from '@expo/vector-icons';
import { useUser } from './contexts/UserContext';
import { useRouter } from "expo-router";

interface RestockHistory {
  date: string;
  quantity: number;
  expirationDate: string;
  totalPrice: number;
  damages?: number;
  staffName?: string;
  staffEmail?: string;
}

interface ConsumptionHistory {
  date: string;
  quantity: number;
  staffName?: string;
  staffEmail?: string;
  expirationDate?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  category: string;
  expirationDate?: string;
  restockHistory: RestockHistory[];
  consumptionHistory?: ConsumptionHistory[];
  totalValue: number;
  threshold: number;
  supplier: string;
}

export default function Inventory() {
  const router = useRouter();
  const { user: authUser, loading: userLoading, role } = useUser();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [damages, setDamages] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    threshold: '',
    supplier: '',
  });
  const [editedItem, setEditedItem] = useState({
    name: '',
    category: '',
    threshold: '',
    supplier: '',
  });
  const [damageModalVisible, setDamageModalVisible] = useState(false);
  const [damageAmount, setDamageAmount] = useState('');
  const [selectedRestockIndex, setSelectedRestockIndex] = useState<number | null>(null);
  const [consumptionQuantity, setConsumptionQuantity] = useState('');
  const [damageExpirationDate, setDamageExpirationDate] = useState('');
  const [availableExpirationDates, setAvailableExpirationDates] = useState<{date: string, quantity: number, damages: number}[]>([]);
  const [expirationSelectVisible, setExpirationSelectVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [damageModalError, setDamageModalError] = useState<string | null>(null);
  const [historyModalError, setHistoryModalError] = useState<string | null>(null);
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);
  const [expirationSelectError, setExpirationSelectError] = useState<string | null>(null);
  const windowDimensions = useWindowDimensions();
  
  // Calculate columns based on screen width
  const getGridColumns = useCallback(() => {
    const width = windowDimensions.width;
    if (width >= 1200) return 5; // Large tablets/desktop
    if (width >= 900) return 4;  // Medium tablets
    if (width >= 600) return 3;  // Small tablets
    return 2; // Phones
  }, [windowDimensions.width]);

  const numColumns = getGridColumns();

  useEffect(() => {
    fetchInventory();
  }, []);

  const checkAndHandleExpiredItems = async (items: InventoryItem[]) => {
    try {
      const now = new Date();
      const updatedItems: InventoryItem[] = [];
      const batch = writeBatch(db);

      for (const item of items) {
        try {
          let hasExpiredItems = false;
          let updatedQuantity = item.quantity;
          let updatedRestockHistory = [...item.restockHistory];

          // Filter out expired batches
          const newRestockHistory = updatedRestockHistory.filter(batch => {
            const expiryDate = new Date(batch.expirationDate);
            
            // If batch is expired
            if (expiryDate < now) {
              const availableQuantity = batch.quantity - (batch.damages || 0);
              updatedQuantity -= availableQuantity;
              hasExpiredItems = true;
              return false; // Remove this batch
            }
            return true; // Keep this batch
          });

          // If we found expired items, update the database
          if (hasExpiredItems) {
            const itemRef = doc(db, 'inventory', item.id);
            batch.update(itemRef, {
              quantity: updatedQuantity,
              restockHistory: newRestockHistory
            });

            updatedItems.push({
              ...item,
              quantity: updatedQuantity,
              restockHistory: newRestockHistory
            });
          } else {
            updatedItems.push(item);
          }
        } catch (error) {
          console.error(`Error processing expired items for item ${item.id}:`, error);
          // Add the original item without processing
          updatedItems.push(item);
        }
      }

      // Commit all the updates in a single batch
      if (updatedItems.length !== items.length) {
        try {
          await batch.commit();
          console.log('Expired items processed successfully');
        } catch (error) {
          console.error('Error committing batch updates for expired items:', error);
        }
      }

      return updatedItems;
    } catch (error) {
      console.error('Error in checkAndHandleExpiredItems:', error);
      // Return the original items if there's an error
      return items;
    }
  };

  const fetchInventory = async () => {
    try {
      try {
        const inventoryRef = collection(db, 'inventory');
        const q = query(inventoryRef, orderBy('name'));
        const querySnapshot = await getDocs(q);
        const items: InventoryItem[] = [];
        querySnapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as InventoryItem);
        });
        
        // Check for expired items and update if needed
        const updatedItems = await checkAndHandleExpiredItems(items);
        setInventory(updatedItems);
      } catch (error) {
        console.error('Error fetching inventory from Firestore:', error);
        Alert.alert('Error', 'Failed to fetch inventory from database');
      } finally {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error in fetchInventory:', error);
      Alert.alert('Error', 'An unexpected error occurred');
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    try {
      try {
        if (!newItem.name || !newItem.threshold) {
          setModalError('Please fill in name and threshold fields');
          return;
        }

        if (isNaN(Number(newItem.threshold)) || Number(newItem.threshold) < 0) {
          setModalError('Please enter a valid threshold value');
          return;
        }

        try {
          const itemData = {
            name: newItem.name,
            quantity: 0,
            category: 'None',
            restockHistory: [],
            consumptionHistory: [],
            totalValue: 0,
            threshold: Number(newItem.threshold),
            supplier: newItem.supplier || 'Not specified',
          };

          const inventoryRef = collection(db, 'inventory');
          const docRef = await addDoc(inventoryRef, itemData);
          
          setInventory([...inventory, { id: docRef.id, ...itemData }]);
          setModalVisible(false);
          setAddMode(false);
          setNewItem({ name: '', threshold: '', supplier: '' });
          setModalError(null);
          Alert.alert('Success', 'Item added successfully');
        } catch (error) {
          console.error('Error adding item to Firestore:', error);
          setModalError('Failed to add item to database');
        }
      } catch (error) {
        console.error('Error in handleAddItem:', error);
        setModalError('An unexpected error occurred');
      }
    } catch (error) {
      console.error('Error in outer handleAddItem:', error);
      setModalError('An unexpected critical error occurred');
    }
  };

  const handleRestock = async () => {
    try {
      if (!selectedItem || !restockQuantity || !expirationDate) {
        setModalError('Please fill in all required fields');
        return;
      }

      // Validate expiration date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD format
      if (!dateRegex.test(expirationDate)) {
        setModalError('Please enter a valid date in YYYY-MM-DD format');
        return;
      }

      // Parse the date to check validity
      const parsedDate = new Date(expirationDate);
      if (isNaN(parsedDate.getTime())) {
        setModalError('Please enter a valid date');
        return;
      }

      // Check if expiration date is in the past
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
      
      if (parsedDate < currentDate) {
        setModalError('Expiration date cannot be in the past');
        return;
      }

      // Validate quantity
      const quantityValue = parseInt(restockQuantity);
      if (isNaN(quantityValue) || quantityValue <= 0) {
        setModalError('Please enter a valid quantity');
        return;
      }

      // Validate damages if provided
      if (damages) {
        const damagesValue = parseInt(damages);
        if (isNaN(damagesValue) || damagesValue < 0) {
          setModalError('Please enter a valid number for damages');
          return;
        }
        
        if (damagesValue > quantityValue) {
          setModalError('Damages cannot exceed restock quantity');
          return;
        }
      }

      if (userLoading) {
        setModalError('Please wait while user data is loading');
        return;
      }

      if (!authUser) {
        setModalError('You must be logged in to perform this action');
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', authUser.uid));
        const staffName = userDoc.exists() ? userDoc.data().name : 'Unknown Staff';

        const itemRef = doc(db, 'inventory', selectedItem.id);
        const newQuantity = selectedItem.quantity + parseInt(restockQuantity);
        const newRestockHistory = {
          date: new Date().toISOString(),
          quantity: parseInt(restockQuantity),
          expirationDate,
          totalPrice: 0,
          damages: damages ? parseInt(damages) : 0,
          staffName: staffName,
          staffEmail: authUser.email || 'Unknown Email'
        };

        await updateDoc(itemRef, {
          quantity: newQuantity,
          restockHistory: arrayUnion(newRestockHistory)
        });
        
        const updatedItem = {
          ...selectedItem,
          quantity: newQuantity,
          restockHistory: [...(selectedItem.restockHistory || []), newRestockHistory]
        };
        
        setInventory(inventory.map(item => 
          item.id === selectedItem.id 
            ? updatedItem
            : item
        ));
        
        setModalVisible(false);
        setRestockQuantity('');
        setExpirationDate('');
        setDamages('');
        setSelectedItem(null);
        setModalError(null);
        Alert.alert('Success', 'Item restocked successfully');
      } catch (error) {
        console.error('Error restocking item in Firestore:', error);
        setModalError('Failed to update inventory in database');
      }
    } catch (error) {
      console.error('Error in handleRestock:', error);
      setModalError('An unexpected error occurred');
    }
  };

  const handleConsumption = async () => {
    try {
      if (!selectedItem || !consumptionQuantity) {
        setModalError('Please fill in all fields');
        return;
      }

      if (userLoading) {
        setModalError('Please wait while user data is loading');
        return;
      }

      if (!authUser) {
        setModalError('You must be logged in to perform this action');
        return;
      }

      try {
        // Get the staff name from users collection
        const userDoc = await getDoc(doc(db, 'users', authUser.uid));
        const staffName = userDoc.exists() ? userDoc.data().name : 'Unknown Staff';

        const itemRef = doc(db, 'inventory', selectedItem.id);
        const newQuantity = selectedItem.quantity - parseInt(consumptionQuantity);
        
        if (newQuantity < 0) {
          setModalError('Consumption amount cannot exceed current quantity');
          return;
        }

        // Find the oldest non-expired stock to consume from
        const now = new Date();
        const validRestockEntries = selectedItem.restockHistory
          .filter(entry => {
            const expiryDate = new Date(entry.expirationDate);
            return expiryDate > now;
          })
          .sort((a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime());

        if (validRestockEntries.length === 0) {
          setModalError('No valid stock available for consumption');
          return;
        }

        const oldestValidStock = validRestockEntries[0];

        // Find and update corresponding restock entry
        const restockIndex = selectedItem.restockHistory.findIndex(entry => 
          entry.expirationDate === oldestValidStock.expirationDate &&
          entry.date === oldestValidStock.date
        );

        if (restockIndex === -1) {
          setModalError('Failed to find matching restock entry');
          return;
        }

        let updatedRestockHistory = [...selectedItem.restockHistory];
        const updatedEntry = { 
          ...updatedRestockHistory[restockIndex],
          quantity: updatedRestockHistory[restockIndex].quantity - parseInt(consumptionQuantity)
        };

        if (updatedEntry.quantity <= 0) {
          updatedRestockHistory.splice(restockIndex, 1);
        } else {
          updatedRestockHistory[restockIndex] = updatedEntry;
        }

        const newConsumptionHistory: ConsumptionHistory = {
          date: new Date().toISOString(),
          quantity: parseInt(consumptionQuantity),
          staffName: staffName,
          staffEmail: authUser.email || 'Unknown Email',
          expirationDate: oldestValidStock.expirationDate
        };

        await updateDoc(itemRef, {
          quantity: newQuantity,
          consumptionHistory: arrayUnion(newConsumptionHistory),
          restockHistory: updatedRestockHistory
        });
        
        const updatedItem = {
          ...selectedItem,
          quantity: newQuantity,
          restockHistory: updatedRestockHistory,
          consumptionHistory: [...(selectedItem.consumptionHistory || []), newConsumptionHistory]
        };
        
        setInventory(inventory.map(item => 
          item.id === selectedItem.id 
            ? updatedItem
            : item
        ));
        
        setModalVisible(false);
        setConsumptionQuantity('');
        setSelectedItem(null);
        setModalError(null);
        Alert.alert('Success', 'Item consumed successfully');
      } catch (error) {
        console.error('Error consuming item in Firestore:', error);
        setModalError('Failed to update consumption in database');
      }
    } catch (error) {
      console.error('Error in handleConsumption:', error);
      setModalError('An unexpected error occurred');
    }
  };

  const handleEdit = async () => {
    try {
      if (!selectedItem) return;

      if (editedItem.threshold && (isNaN(Number(editedItem.threshold)) || Number(editedItem.threshold) < 0)) {
        setModalError('Please enter a valid threshold value');
        return;
      }

      try {
        const itemRef = doc(db, 'inventory', selectedItem.id);
        const updates = {
          name: editedItem.name || selectedItem.name,
          category: editedItem.category || selectedItem.category,
          threshold: editedItem.threshold ? Number(editedItem.threshold) : selectedItem.threshold,
          supplier: editedItem.supplier || selectedItem.supplier,
        };

        await updateDoc(itemRef, updates);
        
        setInventory(inventory.map(item => 
          item.id === selectedItem.id 
            ? { ...item, ...updates }
            : item
        ));
        
        setModalVisible(false);
        setEditMode(false);
        setSelectedItem(null);
        setEditedItem({ name: '', category: '', threshold: '', supplier: '' });
        setModalError(null);
        Alert.alert('Success', 'Item updated successfully');
      } catch (error) {
        console.error('Error updating item in Firestore:', error);
        setModalError('Failed to update item in database');
      }
    } catch (error) {
      console.error('Error in handleEdit:', error);
      setModalError('An unexpected error occurred');
    }
  };

  const handleDelete = async (item: InventoryItem) => {
    try {
      setItemToDelete(item);
      setDeleteModalVisible(true);
    } catch (error) {
      console.error('Error in handleDelete:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const confirmDelete = async () => {
    try {
      if (!itemToDelete) return;
      
      try {
        await deleteDoc(doc(db, 'inventory', itemToDelete.id));
        setInventory(inventory.filter((i) => i.id !== itemToDelete.id));
        setDeleteModalVisible(false);
        setItemToDelete(null);
        setDeleteModalError(null);
        Alert.alert('Success', 'Item deleted successfully');
      } catch (error) {
        console.error('Error deleting item from Firestore:', error);
        setDeleteModalError('Failed to delete item from database');
      }
    } catch (error) {
      console.error('Error in confirmDelete:', error);
      setDeleteModalError('An unexpected error occurred');
    }
  };

  const handleDamageReport = async () => {
    try {
      if (!selectedItem) return;
      
      const damageQty = parseInt(damageAmount);
      if (isNaN(damageQty) || damageQty <= 0) {
        setDamageModalError('Please enter a valid damage quantity');
        return;
      }

      if (!damageExpirationDate) {
        setDamageModalError('Please select an expiration date for the damaged items');
        return;
      }

      try {
        const itemRef = doc(db, 'inventory', selectedItem.id);
        
        // Create a deep copy of the restock history to avoid reference issues
        const updatedHistory: RestockHistory[] = JSON.parse(JSON.stringify(selectedItem.restockHistory));
        
        // Find the batch with the matching expiration date
        const batchIndex = updatedHistory.findIndex(
          (entry: RestockHistory) => entry.expirationDate === damageExpirationDate
        );
        
        if (batchIndex === -1) {
          throw new Error(`No batch found with expiration date ${damageExpirationDate}`);
        }
        
        const batch = updatedHistory[batchIndex];
        const currentDamages = batch.damages || 0;
        const availableQuantity = batch.quantity - currentDamages;

        if (damageQty > availableQuantity) {
          setDamageModalError(`Cannot report more damages than available quantity (${availableQuantity})`);
          return;
        }
        
        // Update the specific batch's damages
        updatedHistory[batchIndex] = {
          ...batch,
          damages: currentDamages + damageQty
        };

        // Calculate the new total quantity by summing all batches
        const newQuantity = updatedHistory.reduce((total: number, batch: RestockHistory) => {
          return total + (batch.quantity - (batch.damages || 0));
        }, 0);
        
        // Update the database with the specific batch change
        await updateDoc(itemRef, {
          quantity: newQuantity,
          restockHistory: updatedHistory
        });

        // Update local state
        const updatedItem = {
          ...selectedItem,
          quantity: newQuantity,
          restockHistory: updatedHistory
        };

        setInventory(inventory.map(item =>
          item.id === selectedItem.id
            ? updatedItem
            : item
        ));

        setSelectedItem(updatedItem);
        setDamageModalVisible(false);
        setDamageAmount('');
        setDamageExpirationDate('');
        setAvailableExpirationDates([]);
        setDamageModalError(null);
        Alert.alert('Success', `Damage report of ${damageQty} items recorded for batch expiring on ${damageExpirationDate}`);
      } catch (error) {
        console.error('Error recording damage in Firestore:', error);
        setDamageModalError('Failed to record damage in database: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    } catch (error) {
      console.error('Error in handleDamageReport:', error);
      setDamageModalError('An unexpected error occurred');
    }
  };

  // Function to prepare the damage report modal
  const prepareDamageReport = (item: InventoryItem) => {
    try {
      if (!item.restockHistory || item.restockHistory.length === 0) {
        Alert.alert('Error', 'No stock batches available to report damage');
        return;
      }

      // Get available expiration dates with their quantities
      const dates = item.restockHistory.map(entry => ({
        date: entry.expirationDate,
        quantity: entry.quantity,
        damages: entry.damages || 0
      }));

      // Filter out entries with no available quantity
      const availableDates = dates.filter(d => (d.quantity - d.damages) > 0);

      if (availableDates.length === 0) {
        Alert.alert('Error', 'No stock batches available with remaining quantity');
        return;
      }

      setSelectedItem(item);
      setAvailableExpirationDates(availableDates);
      setExpirationSelectVisible(true);
      setExpirationSelectError(null);
    } catch (error) {
      console.error('Error in prepareDamageReport:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const handleDeleteHistory = async (type: 'restock' | 'consumption', index: number) => {
    try {
      if (!selectedItem) return;
      if (role !== 'owner') {
        Alert.alert('Error', 'Only owners can delete history entries');
        return;
      }

      Alert.alert(
        'Confirm Delete',
        'Are you sure you want to delete this history entry? This will update the inventory quantities.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                try {
                  const itemRef = doc(db, 'inventory', selectedItem.id);
                  let updatedItem = { ...selectedItem };

                  if (type === 'restock') {
                    const restockEntry = selectedItem.restockHistory[index];
                    
                    // Remove the entry from history
                    const updatedHistory = [...selectedItem.restockHistory];
                    updatedHistory.splice(index, 1);

                    // Recalculate total quantity and value based on remaining batches
                    const newQuantity = updatedHistory.reduce((total, batch) => {
                      return total + (batch.quantity - (batch.damages || 0));
                    }, 0);
                    
                    const newTotalValue = updatedHistory.reduce((total, batch) => {
                      return total + batch.totalPrice;
                    }, 0);

                    await updateDoc(itemRef, {
                      quantity: newQuantity,
                      totalValue: newTotalValue,
                      restockHistory: updatedHistory
                    });

                    updatedItem = {
                      ...updatedItem,
                      quantity: newQuantity,
                      totalValue: newTotalValue,
                      restockHistory: updatedHistory
                    };
                  } else {
                    if (!selectedItem.consumptionHistory) {
                      console.error('Consumption history is undefined');
                      return;
                    }
                    const consumptionEntry = selectedItem.consumptionHistory[index];
                    
                    // Add back the consumed quantity
                    const newQuantity = selectedItem.quantity + consumptionEntry.quantity;

                    // Remove the entry from history
                    const updatedHistory = [...(selectedItem.consumptionHistory || [])];
                    updatedHistory.splice(index, 1);

                    await updateDoc(itemRef, {
                      quantity: newQuantity,
                      consumptionHistory: updatedHistory
                    });

                    updatedItem = {
                      ...updatedItem,
                      quantity: newQuantity,
                      consumptionHistory: updatedHistory
                    };
                  }

                  setInventory(inventory.map(item =>
                    item.id === selectedItem.id ? updatedItem : item
                  ));
                  setSelectedItem(updatedItem);
                  Alert.alert('Success', 'History entry deleted successfully');
                } catch (error) {
                  console.error('Error deleting history in Firestore:', error);
                  Alert.alert('Error', 'Failed to delete history entry in database');
                }
              } catch (error) {
                console.error('Error in handleDeleteHistory onPress handler:', error);
                Alert.alert('Error', 'An unexpected error occurred');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error in handleDeleteHistory:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const handleDeleteExpiredBatch = async (itemId: string, expirationDate: string, index: number) => {
    try {
      if (!itemId) {
        setHistoryModalError('Invalid item selected');
        return;
      }

      Alert.alert(
        'Confirm Delete Expired Batch',
        'Are you sure you want to delete this expired batch?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                const itemRef = doc(db, 'inventory', itemId);
                const itemDoc = await getDoc(itemRef);
                
                if (!itemDoc.exists()) {
                  setHistoryModalError('Item not found');
                  return;
                }
                
                const itemData = itemDoc.data();
                const restockHistory = [...itemData.restockHistory];
                
                // Find and remove the expired batch
                const batchIndex = restockHistory.findIndex(
                  entry => entry.expirationDate === expirationDate
                );
                
                if (batchIndex === -1) {
                  setHistoryModalError('Expired batch not found');
                  return;
                }
                
                // Get the batch details
                const batch = restockHistory[batchIndex];
                const availableQuantity = batch.quantity - (batch.damages || 0);
                
                // Remove the batch
                restockHistory.splice(batchIndex, 1);
                
                // Update item quantity
                const newQuantity = itemData.quantity - availableQuantity;
                
                // Update in Firestore
                await updateDoc(itemRef, {
                  quantity: newQuantity,
                  restockHistory: restockHistory
                });
                
                // Update the local state
                if (selectedItem) {
                  const updatedItem = {
                    ...selectedItem,
                    quantity: newQuantity,
                    restockHistory: restockHistory
                  };
                  
                  setSelectedItem(updatedItem);
                  setInventory(inventory.map(item => 
                    item.id === itemId ? updatedItem : item
                  ));
                }
                
                Alert.alert('Success', 'Expired batch deleted successfully');
              } catch (error) {
                console.error('Error deleting expired batch:', error);
                setHistoryModalError('Failed to delete expired batch');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error in handleDeleteExpiredBatch:', error);
      setHistoryModalError('An unexpected error occurred');
    }
  };

  const renderHistoryItem = (history: RestockHistory, index: number) => {
    const isExpired = new Date(history.expirationDate) < new Date();
    const availableQuantity = history.quantity - (history.damages || 0);
    
    return (
      <View key={`restock-${index}`} style={[
        styles.historyItem,
        isExpired ? styles.expiredHistoryItem : null
      ]}>
        <View style={styles.historyItemHeader}>
          <Text style={styles.historyType}>Restock</Text>
          <Text style={styles.historyDate}>
            {new Date(history.date).toLocaleString()} by {history.staffName}
          </Text>
          <Text style={styles.historyQuantity}>
            +{history.quantity} Stock
          </Text>
          {role === 'owner' && (
            <TouchableOpacity
              style={styles.deleteHistoryButton}
              onPress={() => handleDeleteHistory('restock', index)}
            >
              <FontAwesome name="trash" size={16} color="#F44336" />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.historyDivider} />
        <View style={styles.historyDetails}>
          <Text style={styles.historyExpiration}>
            <FontAwesome name="cubes" size={14} color="#666" /> Available Stock: {availableQuantity}
          </Text>
          {(history.damages ?? 0) > 0 && (
            <Text style={[styles.historyExpiration, {color: '#F44336'}]}>
              <FontAwesome name="warning" size={14} color="#F44336" /> Damaged Stock: -{history.damages}
            </Text>
          )}
          <Text style={[
            styles.historyExpiration,
            isExpired ? styles.expiredText : null
          ]}>
            <FontAwesome 
              name="calendar" 
              size={14} 
              color={isExpired ? "#F44336" : "#666"} 
            /> Expiration Date: {history.expirationDate || 'N/A'}
            {isExpired && " (EXPIRED)"}
          </Text>
          {isExpired && (
            <TouchableOpacity
              style={styles.deleteExpiredButton}
              onPress={() => handleDeleteExpiredBatch(selectedItem?.id || '', history.expirationDate, index)}
            >
              <FontAwesome name="trash" size={14} color="#F44336" />
              <Text style={styles.deleteExpiredButtonText}>Delete Expired Batch</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: InventoryItem }) => (
    <TouchableOpacity 
      style={[
        styles.itemContainer,
        item.quantity <= (item.threshold || 0) ? styles.lowStockContainer : null,
        { width: 220 } // Fixed width of 200px instead of percentage calculation
      ]}
      onPress={() => {
        setSelectedItem(item);
        setHistoryModalVisible(true);
      }}
    >
      <View style={styles.itemHeader}>
        {item.quantity <= (item.threshold || 0) && (
          <View style={styles.stockStatusBadge}>
            <Text style={styles.stockStatusText}>Low Stock</Text>
          </View>
        )}
      </View>
      
      <View style={styles.itemNameContainer}>
        <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
      </View>
      
      <View style={styles.itemContent}>
        <View style={styles.itemInfo}>
          <View style={styles.infoRow}>
            <FontAwesome name="cubes" size={14} color="#666" style={styles.infoIcon} />
            <Text style={styles.itemDetails}>
              Stock: <Text style={styles.highlightedText}>{item.quantity}</Text>
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <FontAwesome name="building" size={14} color="#666" style={styles.infoIcon} />
            <Text style={styles.itemDetails}>
              Supplier: <Text style={styles.normalText}>{item.supplier || 'N/A'}</Text>
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <FontAwesome name="tag" size={14} color="#666" style={styles.infoIcon} />
            <Text style={styles.itemDetails}>
              Category: <Text style={styles.normalText}>{item.category}</Text>
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <FontAwesome name="warning" size={14} color={item.quantity <= (item.threshold || 0) ? "#f44336" : "#666"} style={styles.infoIcon} />
            <Text style={[
              styles.itemThreshold, 
              item.quantity <= (item.threshold || 0) ? styles.belowThreshold : null
            ]}>
              Threshold: <Text style={item.quantity <= (item.threshold || 0) ? styles.thresholdText : styles.normalText}>{item.threshold || 0}</Text>
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.itemActionsContainer}>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            setSelectedItem(item);
            setEditMode(false);
            setAddMode(false);
            setModalVisible(true);
          }}
          style={styles.actionButtonPrimary}
        >
          <FontAwesome name="plus-circle" size={16} color="#FFF" style={styles.buttonIcon} />
          <Text style={styles.actionButtonText}>Restock</Text>
        </TouchableOpacity>
        
        <View style={styles.itemActionsRow}>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              setSelectedItem(item);
              setEditMode(true);
              setAddMode(false);
              setEditedItem({
                name: item.name,
                category: item.category || '',
                threshold: item.threshold?.toString() || '',
                supplier: item.supplier || '',
              });
              setModalVisible(true);
            }}
            style={styles.actionButtonSecondary}
          >
            <FontAwesome name="edit" size={16} color="#FFF" style={styles.buttonIcon} />
            <Text style={styles.smallButtonText}>Edit</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              prepareDamageReport(item);
            }}
            style={styles.actionButtonWarning}
          >
            <FontAwesome name="exclamation-triangle" size={14} color="#FFF" style={styles.buttonIcon} />
            <Text style={styles.smallButtonText}>Damage</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              handleDelete(item);
            }}
            style={styles.actionButtonDanger}
          >
            <FontAwesome name="trash" size={16} color="#FFFFFF" style={styles.buttonIcon} />
            <Text style={styles.smallButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  const isValidDate = (dateString: string): boolean => {
    // Check format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) {
      return false;
    }
    
    // Check if it's a valid date
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return false;
    }
    
    // Check if it's not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <FontAwesome name="arrow-left" size={20} color="#333" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Inventory Management</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setAddMode(true);
            setEditMode(false);
            setModalVisible(true);
          }}
        >
          <FontAwesome name="plus" size={20} color="white" />
          <Text style={styles.addButtonText}>Add New Stock</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={inventory}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        numColumns={numColumns}
        key={`grid-${numColumns}`}
        columnWrapperStyle={styles.columnWrapper}
        getItemLayout={(data, index) => ({
          length: 300,
          offset: 300 * Math.floor(index / numColumns),
          index,
        })}
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {addMode ? 'Add New Item' : editMode ? 'Edit Item' : 'Restock Item'}
            </Text>
            {modalError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{modalError}</Text>
              </View>
            )}
            {addMode ? (
              <>
                <Text style={{fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 4, marginLeft: 2}}>Item Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter item name"
                  value={newItem.name}
                  onChangeText={(text) =>
                    setNewItem({ ...newItem, name: text })
                  }
                />
                <Text style={{fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 4, marginLeft: 2}}>Minimum Stock Level</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter threshold value"
                  value={newItem.threshold}
                  keyboardType="number-pad"
                  onChangeText={(text) =>
                    setNewItem({ ...newItem, threshold: text })
                  }
                />
                <Text style={{fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 4, marginLeft: 2}}>Supplier</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter supplier name"
                  value={newItem.supplier}
                  onChangeText={(text) =>
                    setNewItem({ ...newItem, supplier: text })
                  }
                />
              </>
            ) : editMode ? (
              <>
                <Text style={{fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 4, marginLeft: 2}}>Item Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter item name"
                  value={editedItem.name}
                  onChangeText={(text) =>
                    setEditedItem({ ...editedItem, name: text })
                  }
                />
                <Text style={{fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 4, marginLeft: 2}}>Category</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter category"
                  value={editedItem.category}
                  onChangeText={(text) =>
                    setEditedItem({ ...editedItem, category: text })
                  }
                />
                <Text style={{fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 4, marginLeft: 2}}>Minimum Stock Level</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter threshold value"
                  value={editedItem.threshold}
                  keyboardType="number-pad"
                  onChangeText={(text) =>
                    setEditedItem({ ...editedItem, threshold: text })
                  }
                />
                <Text style={{fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 4, marginLeft: 2}}>Supplier</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter supplier name"
                  value={editedItem.supplier}
                  onChangeText={(text) =>
                    setEditedItem({ ...editedItem, supplier: text })
                  }
                />
              </>
            ) : (
              <>
                <Text style={{fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 4, marginLeft: 2}}>Restock Quantity</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter number of items"
                  keyboardType="number-pad"
                  value={restockQuantity}
                  onChangeText={setRestockQuantity}
                />
                <Text style={{fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 4, marginLeft: 2}}>Expiration Date</Text>
                <TextInput
                  style={[styles.input, expirationDate && !isValidDate(expirationDate) && styles.inputError]}
                  placeholder="YYYY-MM-DD"
                  value={expirationDate}
                  onChangeText={setExpirationDate}
                />
                <Text style={{fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 4, marginLeft: 2}}>Damaged Items (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter number of damaged items"
                  keyboardType="number-pad"
                  value={damages}
                  onChangeText={setDamages}
                />
              </>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  setModalVisible(false);
                  setEditMode(false);
                  setAddMode(false);
                  setSelectedItem(null);
                  setRestockQuantity('');
                  setExpirationDate('');
                  setDamages('');
                  setEditedItem({ name: '', category: '', threshold: '', supplier: '' });
                  setNewItem({ name: '', threshold: '', supplier: '' });
                  setModalError(null);
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={addMode ? handleAddItem : editMode ? handleEdit : handleRestock}
              >
                <Text style={styles.buttonText}>
                  {addMode ? 'Add Item' : editMode ? 'Save Changes' : 'Restock'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={historyModalVisible}
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, styles.historyModalContent]}>
            <View style={styles.historyHeader}>
              <Text style={styles.modalTitle}>Stock History</Text>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => {
                  setHistoryModalVisible(false);
                  setSelectedItem(null);
                  setHistoryModalError(null);
                }}
              >
                <FontAwesome name="times" size={24} color="#666" />
              </TouchableOpacity>
              {historyModalError && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{historyModalError}</Text>
                </View>
              )}
              <Text style={styles.historyItemName}>{selectedItem?.name}</Text>
              <View style={styles.itemSummary}>
                <Text style={styles.summaryText}>Current Stock: {selectedItem?.quantity}</Text>
                <Text style={styles.summaryText}>Latest Expiry: {selectedItem?.expirationDate || 'N/A'}</Text>
              </View>
            </View>
            
            <ScrollView style={styles.historyList}>
              {selectedItem?.restockHistory && selectedItem.restockHistory.length > 0 ? (
                [...selectedItem.restockHistory]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((history, index) => renderHistoryItem(history, index))
              ) : null}

              {selectedItem?.consumptionHistory && selectedItem.consumptionHistory.length > 0 ? (
                [...selectedItem.consumptionHistory]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((history, index) => (
                    <View key={`consumption-${index}`} style={[styles.historyItem, styles.consumptionItem]}>
                      <View style={styles.historyItemHeader}>
                        <Text style={styles.historyTypeConsumption}>Consumption</Text>
                        <Text style={styles.historyDate}>
                          {new Date(history.date).toLocaleString()} by {history.staffName}
                        </Text>
                        <Text style={styles.historyQuantityNegative}>
                          -{history.quantity} Stock
                        </Text>
                        {role === 'owner' && (
                          <TouchableOpacity
                            style={styles.deleteHistoryButton}
                            onPress={() => handleDeleteHistory('consumption', index)}
                          >
                            <FontAwesome name="trash" size={16} color="#F44336" />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.historyDivider} />
                      <View style={styles.historyDetails}>
                        <Text style={styles.historyExpiration}>
                          <FontAwesome name="calendar" size={14} color="#666" /> Consumed from batch expiring: {history.expirationDate || 'N/A'}
                        </Text>
                      </View>
                    </View>
                  ))
              ) : null}

              {(!selectedItem?.restockHistory || selectedItem.restockHistory.length === 0) && 
               (!selectedItem?.consumptionHistory || selectedItem.consumptionHistory.length === 0) && (
                <View style={styles.noHistoryContainer}>
                  <FontAwesome name="history" size={40} color="#ddd" />
                  <Text style={styles.noHistoryText}>No history available</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={damageModalVisible}
        onRequestClose={() => setDamageModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, styles.damageModalContent]}>
            <Text style={styles.modalTitle}>Report Damage</Text>
            {damageModalError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{damageModalError}</Text>
              </View>
            )}
            <TextInput
              style={styles.input}
              placeholder="Enter number of damaged items"
              keyboardType="number-pad"
              value={damageAmount}
              onChangeText={setDamageAmount}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  setDamageModalVisible(false);
                  setDamageAmount('');
                  setSelectedRestockIndex(null);
                  setDamageModalError(null);
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.confirmButton]}
                onPress={handleDamageReport}
              >
                <Text style={styles.buttonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={expirationSelectVisible}
        onRequestClose={() => setExpirationSelectVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, styles.damageModalContent]}>
            <Text style={styles.modalTitle}>Select Batch to Report Damage</Text>
            {expirationSelectError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{expirationSelectError}</Text>
              </View>
            )}
            <Text style={styles.modalSubtitle}>Select which batch has the damaged items:</Text>
            
            <ScrollView style={styles.expirationList}>
              {availableExpirationDates.map((dateInfo, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={[
                    styles.expirationItem,
                    damageExpirationDate === dateInfo.date ? styles.selectedExpirationItem : null
                  ]}
                  onPress={() => setDamageExpirationDate(dateInfo.date)}
                >
                  <Text style={styles.expirationDate}>
                    Expiration: {dateInfo.date}
                  </Text>
                  <Text style={styles.expirationQuantity}>
                    Available: {dateInfo.quantity - dateInfo.damages}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  setExpirationSelectVisible(false);
                  setDamageExpirationDate('');
                  setAvailableExpirationDates([]);
                  setExpirationSelectError(null);
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.confirmButton]}
                onPress={() => {
                  if (damageExpirationDate) {
                    setExpirationSelectVisible(false);
                    setDamageModalVisible(true);
                  } else {
                    setExpirationSelectError('Please select an expiration date');
                  }
                }}
              >
                <Text style={styles.buttonText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={deleteModalVisible}
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, styles.deleteModalContent]}>
            <Text style={styles.modalTitle}>Confirm Delete</Text>
            {deleteModalError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{deleteModalError}</Text>
              </View>
            )}
            <Text style={styles.deleteConfirmText}>
              Are you sure you want to delete {itemToDelete?.name}?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setItemToDelete(null);
                  setDeleteModalError(null);
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.deleteButton]}
                onPress={confirmDelete}
              >
                <Text style={styles.buttonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F36514',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: 'white',
    marginLeft: 5,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  listContainer: {
    padding: 12,
    width: '100%',
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: 16,
    padding: 4,
  },
  itemContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 16,
    width: 200,
    height: 'auto',
    minHeight: 280,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#eee',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  lowStockContainer: {
    borderColor: '#ffcdd2',
    borderWidth: 1,
    backgroundColor: '#fff8f8',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 4,
  },
  stockStatusBadge: {
    backgroundColor: '#f44336',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stockStatusText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  itemNameContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    paddingHorizontal: 10,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  itemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F36514',
    textAlign: 'center',
  },
  itemContent: {
    flex: 1,
    marginTop: 4,
  },
  itemInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoIcon: {
    marginRight: 6,
    width: 14,
  },
  itemDetails: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
  normalText: {
    color: '#555',
    fontWeight: 'normal',
  },
  highlightedText: {
    color: '#F36514',
    fontWeight: 'bold',
  },
  priceText: {
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  thresholdText: {
    color: '#f44336',
    fontWeight: 'bold',
  },
  itemPrice: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
  itemCategory: {
    fontSize: 13,
    color: '#888',
  },
  itemThreshold: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
  belowThreshold: {
    color: '#f44336',
  },
  itemActionsContainer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 10,
    marginTop: 'auto',
  },
  itemActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  actionButtonPrimary: {
    backgroundColor: '#F36514',
    padding: 10,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  actionButtonSecondary: {
    backgroundColor: '#4CAF50',
    padding: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    elevation: 1,
  },
  actionButtonWarning: {
    backgroundColor: '#ff9800',
    padding: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    elevation: 1,
  },
  actionButtonDanger: {
    backgroundColor: '#F44336',
    padding: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    elevation: 1,
  },
  buttonIcon: {
    marginRight: 4,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  smallButtonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 24,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 18,
    width: '75%',
    maxWidth: 500,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    fontSize: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  button: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: '#666',
    flex: 1,
    marginRight: 5,
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
    flex: 1,
    marginLeft: 5,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
  historyModalContent: {
    maxHeight: '78%',
    width: '85%',
    maxWidth: 650,
  },
  historyHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 12,
    marginBottom: 12,
    position: 'relative',
  },
  closeModalButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 6,
  },
  historyItemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginVertical: 4,
  },
  itemSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 6,
  },
  summaryText: {
    fontSize: 14,
    color: '#666',
  },
  historyList: {
    marginVertical: 10,
  },
  historyItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  historyItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 8,
  },
  historyDetails: {
    paddingVertical: 4,
  },
  historyExpiration: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  historyPrice: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  historyDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  historyQuantity: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  historyQuantityNegative: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F44336',
  },
  noHistoryContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  noHistoryText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 16,
    marginTop: 15,
  },
  damageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  damageButtonText: {
    color: '#ff9800',
    fontSize: 14,
    fontWeight: '500',
  },
  damageModalContent: {
    width: '75%',
    padding: 18,
    maxWidth: 450,
  },
  historyType: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: 'bold',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyTypeConsumption: {
    fontSize: 12,
    color: '#F44336',
    fontWeight: 'bold',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  consumptionItem: {
    borderColor: '#FFEBEE',
  },
  deleteHistoryButton: {
    padding: 8,
    marginLeft: 'auto',
  },
  expirationList: {
    maxHeight: 200,
    marginVertical: 10,
  },
  expirationItem: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    marginBottom: 6,
  },
  selectedExpirationItem: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  expirationDate: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  expirationQuantity: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
  },
  iconMargin: {
    marginRight: 4,
  },
  deleteModalContent: {
    width: '55%',
    padding: 18,
    maxWidth: 400,
  },
  deleteConfirmText: {
    fontSize: 15,
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  deleteButton: {
    backgroundColor: '#F44336',
    flex: 1,
    marginLeft: 5,
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#EF9A9A',
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
    width: '100%',
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 14,
    textAlign: 'center',
  },
  expiredHistoryItem: {
    backgroundColor: '#FFEBEE',
  },
  expiredText: {
    color: '#F44336',
  },
  deleteExpiredButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F44336',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginTop: 8,
    width: 'auto',
    alignSelf: 'flex-start'
  },
  deleteExpiredButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 6
  },
  inputHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
  },
  inputError: {
    borderColor: '#F44336',
  },
});