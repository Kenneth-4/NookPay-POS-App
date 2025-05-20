import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { router } from 'expo-router';

interface InventoryTransaction {
  id: string;
  ingredientId: string;
  ingredientName: string;
  type: 'addition' | 'deduction';
  quantity: number;
  unit: string;
  timestamp: Timestamp;
  reason: string;
}

interface InventoryReport {
  transactions: InventoryTransaction[];
  summary: {
    [key: string]: {
      name: string;
      unit: string;
      totalAdditions: number;
      totalDeductions: number;
      netChange: number;
    };
  };
}

export default function InventoryReport() {
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [report, setReport] = useState<InventoryReport>({
    transactions: [],
    summary: {}
  });

  useEffect(() => {
    // Check if collection exists and has data
    const checkCollection = async () => {
      try {
        const transactionsRef = collection(db, 'inventoryTransactions');
        const snapshot = await getDocs(transactionsRef);
        console.log('Collection exists:', !snapshot.empty);
        console.log('Total documents:', snapshot.size);
        if (!snapshot.empty) {
          const sampleDoc = snapshot.docs[0].data();
          console.log('Sample document structure:', sampleDoc);
        }
      } catch (error) {
        console.error('Error checking collection:', error);
      }
    };

    checkCollection();
    loadInventoryReport();
  }, [startDate, endDate]);

  const loadInventoryReport = async () => {
    setIsLoading(true);
    try {
      // Set start date to beginning of day and end date to end of day
      const startOfDay = new Date(startDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);

      console.log('Fetching transactions from', startOfDay, 'to', endOfDay);

      const transactionsRef = collection(db, 'inventoryTransactions');
      const q = query(
        transactionsRef,
        where('timestamp', '>=', Timestamp.fromDate(startOfDay)),
        where('timestamp', '<=', Timestamp.fromDate(endOfDay))
      );

      console.log('Executing query...');
      const querySnapshot = await getDocs(q);
      console.log('Found', querySnapshot.size, 'transactions');

      const transactions: InventoryTransaction[] = [];
      const summary: InventoryReport['summary'] = {};

      querySnapshot.forEach((doc) => {
        const data = doc.data() as Omit<InventoryTransaction, 'id'>;
        const transaction = {
          id: doc.id,
          ingredientId: data.ingredientId,
          ingredientName: data.ingredientName,
          type: data.type,
          quantity: data.quantity,
          unit: data.unit,
          timestamp: data.timestamp,
          reason: data.reason
        };
        
        transactions.push(transaction);

        // Update summary
        if (!summary[data.ingredientId]) {
          summary[data.ingredientId] = {
            name: data.ingredientName,
            unit: data.unit,
            totalAdditions: 0,
            totalDeductions: 0,
            netChange: 0
          };
        }

        if (data.type === 'addition') {
          summary[data.ingredientId].totalAdditions += data.quantity;
          summary[data.ingredientId].netChange += data.quantity;
        } else {
          summary[data.ingredientId].totalDeductions += data.quantity;
          summary[data.ingredientId].netChange -= data.quantity;
        }
      });

      console.log('Processed transactions:', transactions.length);
      console.log('Summary:', summary);

      setReport({ transactions, summary });
    } catch (error) {
      console.error('Error loading inventory report:', error);
      Alert.alert(
        'Error',
        'Failed to load inventory report. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleConfirmStartDate = (date: Date) => {
    if (date > endDate) {
      setEndDate(date);
    }
    setStartDate(date);
    setShowStartPicker(false);
  };

  const handleConfirmEndDate = (date: Date) => {
    if (date < startDate) {
      setStartDate(date);
    }
    setEndDate(date);
    setShowEndPicker(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <FontAwesome name="arrow-left" size={24} color="#4F46E5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inventory Report</Text>
      </View>

      <View style={styles.datePickerContainer}>
        <TouchableOpacity 
          style={styles.dateButton}
          onPress={() => setShowStartPicker(true)}
        >
          <FontAwesome name="calendar" size={20} color="#4F46E5" />
          <Text style={styles.dateText}>From: {formatDate(startDate)}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.dateButton}
          onPress={() => setShowEndPicker(true)}
        >
          <FontAwesome name="calendar" size={20} color="#4F46E5" />
          <Text style={styles.dateText}>To: {formatDate(endDate)}</Text>
        </TouchableOpacity>

        <DateTimePickerModal
          isVisible={showStartPicker}
          mode="date"
          onConfirm={handleConfirmStartDate}
          onCancel={() => setShowStartPicker(false)}
          date={startDate}
          maximumDate={endDate}
        />

        <DateTimePickerModal
          isVisible={showEndPicker}
          mode="date"
          onConfirm={handleConfirmEndDate}
          onCancel={() => setShowEndPicker(false)}
          date={endDate}
          minimumDate={startDate}
        />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {/* Summary Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Inventory Summary</Text>
            {Object.values(report.summary).map((item, index) => (
              <View key={index} style={styles.summaryItem}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View style={styles.itemDetails}>
                  <Text style={styles.detailText}>
                    Added: +{item.totalAdditions} {item.unit}
                  </Text>
                  <Text style={styles.detailText}>
                    Used: -{item.totalDeductions} {item.unit}
                  </Text>
                  <Text style={[
                    styles.netChange,
                    item.netChange >= 0 ? styles.positive : styles.negative
                  ]}>
                    Net: {item.netChange >= 0 ? '+' : ''}{item.netChange} {item.unit}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Transactions Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transaction History</Text>
            {report.transactions
              .sort((a, b) => b.timestamp.seconds - a.timestamp.seconds)
              .map((transaction, index) => (
                <View key={index} style={styles.transactionItem}>
                  <View style={styles.transactionHeader}>
                    <Text style={styles.transactionDate}>
                      {new Date(transaction.timestamp.seconds * 1000).toLocaleString()}
                    </Text>
                    <View style={[
                      styles.transactionType,
                      transaction.type === 'addition' ? styles.additionType : styles.deductionType
                    ]}>
                      <Text style={styles.transactionTypeText}>
                        {transaction.type === 'addition' ? 'Added' : 'Used'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.transactionName}>{transaction.ingredientName}</Text>
                  <Text style={styles.transactionQuantity}>
                    {transaction.type === 'addition' ? '+' : '-'}
                    {transaction.quantity} {transaction.unit}
                  </Text>
                  {transaction.reason && (
                    <Text style={styles.transactionReason}>{transaction.reason}</Text>
                  )}
                </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1F2937',
  },
  datePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    gap: 8,
  },
  dateText: {
    fontSize: 16,
    color: '#4F46E5',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  summaryItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 12,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  itemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 14,
    color: '#6B7280',
  },
  netChange: {
    fontSize: 14,
    fontWeight: '600',
  },
  positive: {
    color: '#10B981',
  },
  negative: {
    color: '#EF4444',
  },
  transactionItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 12,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  transactionType: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  additionType: {
    backgroundColor: '#D1FAE5',
  },
  deductionType: {
    backgroundColor: '#FEE2E2',
  },
  transactionTypeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  transactionName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 4,
  },
  transactionQuantity: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 4,
  },
  transactionReason: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
});
